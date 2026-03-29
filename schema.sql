-- ============================================================
-- Reimbursement Management System - MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS reimbursement_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE reimbursement_db;

-- ── Companies ────────────────────────────────────────────────
CREATE TABLE companies (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255)  NOT NULL,
  country      VARCHAR(100)  NOT NULL,
  currency     VARCHAR(10)   NOT NULL DEFAULT 'USD',
  currency_symbol VARCHAR(10) NOT NULL DEFAULT '$',
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  company_id   INT          NOT NULL,
  name         VARCHAR(255) NOT NULL,
  email        VARCHAR(255) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,  -- bcrypt hash
  role         ENUM('admin','manager','employee') NOT NULL DEFAULT 'employee',
  manager_id   INT          NULL,       -- FK to users.id (employee's direct manager)
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_company  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_manager  FOREIGN KEY (manager_id) REFERENCES users(id)     ON DELETE SET NULL
);

-- ── Expense Categories ───────────────────────────────────────
CREATE TABLE expense_categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT          NOT NULL,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_category_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Seed common categories for every new company (via trigger or app logic)
-- Travel, Meals, Accommodation, Office Supplies, Software, Miscellaneous

-- ── Approval Rules ───────────────────────────────────────────
-- One rule per expense category (or a default "Miscellaneous" rule)
CREATE TABLE approval_rules (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  company_id             INT          NOT NULL,
  name                   VARCHAR(255) NOT NULL,
  category_id            INT          NULL,  -- NULL = global rule
  is_manager_approver    TINYINT(1)   NOT NULL DEFAULT 0, -- manager must approve first
  rule_type              ENUM('sequential','percentage','specific_approver','hybrid') NOT NULL DEFAULT 'sequential',
  percentage_threshold   DECIMAL(5,2) NULL,   -- for percentage rule (0-100)
  specific_approver_id   INT          NULL,   -- for specific_approver / hybrid rules
  created_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rule_company   FOREIGN KEY (company_id)          REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_rule_category  FOREIGN KEY (category_id)         REFERENCES expense_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_rule_specific  FOREIGN KEY (specific_approver_id) REFERENCES users(id)    ON DELETE SET NULL
);

-- ── Approval Rule Steps (ordered approvers) ──────────────────
CREATE TABLE approval_rule_steps (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  rule_id        INT  NOT NULL,
  approver_id    INT  NOT NULL,
  step_order     INT  NOT NULL,   -- 1, 2, 3 …
  is_required    TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_step_rule      FOREIGN KEY (rule_id)     REFERENCES approval_rules(id) ON DELETE CASCADE,
  CONSTRAINT fk_step_approver  FOREIGN KEY (approver_id) REFERENCES users(id)          ON DELETE CASCADE,
  UNIQUE KEY uq_rule_step (rule_id, step_order)
);

-- ── Expenses ─────────────────────────────────────────────────
CREATE TABLE expenses (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  company_id       INT             NOT NULL,
  employee_id      INT             NOT NULL,
  category_id      INT             NULL,
  title            VARCHAR(255)    NOT NULL,
  description      TEXT            NULL,
  amount           DECIMAL(15,2)   NOT NULL,
  currency         VARCHAR(10)     NOT NULL,   -- currency submitted by employee
  amount_converted DECIMAL(15,2)   NULL,        -- in company's base currency
  conversion_rate  DECIMAL(15,6)   NULL,
  expense_date     DATE            NOT NULL,
  receipt_path     VARCHAR(512)    NULL,        -- file path / URL
  ocr_raw          JSON            NULL,        -- raw OCR output
  status           ENUM('draft','pending','approved','rejected','cancelled') NOT NULL DEFAULT 'draft',
  rule_id          INT             NULL,        -- which rule governs this expense
  created_at       TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_expense_company   FOREIGN KEY (company_id)  REFERENCES companies(id)          ON DELETE CASCADE,
  CONSTRAINT fk_expense_employee  FOREIGN KEY (employee_id) REFERENCES users(id)               ON DELETE CASCADE,
  CONSTRAINT fk_expense_category  FOREIGN KEY (category_id) REFERENCES expense_categories(id)  ON DELETE SET NULL,
  CONSTRAINT fk_expense_rule      FOREIGN KEY (rule_id)     REFERENCES approval_rules(id)       ON DELETE SET NULL
);

-- ── Approval Requests ────────────────────────────────────────
-- One row per approver per expense (created lazily as workflow progresses)
CREATE TABLE approval_requests (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  expense_id    INT          NOT NULL,
  approver_id   INT          NOT NULL,
  step_order    INT          NOT NULL,
  status        ENUM('pending','approved','rejected','skipped') NOT NULL DEFAULT 'pending',
  comments      TEXT         NULL,
  responded_at  TIMESTAMP    NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_req_expense   FOREIGN KEY (expense_id)  REFERENCES expenses(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_approver  FOREIGN KEY (approver_id) REFERENCES users(id)    ON DELETE CASCADE
);

-- ── Audit Log ────────────────────────────────────────────────
CREATE TABLE audit_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id  INT          NOT NULL,
  user_id     INT          NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50)  NOT NULL,
  entity_id   INT          NULL,
  meta        JSON         NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ── Sessions (if using DB sessions instead of JWT) ───────────
CREATE TABLE sessions (
  id         VARCHAR(128) PRIMARY KEY,
  user_id    INT          NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX idx_expenses_employee  ON expenses (employee_id);
CREATE INDEX idx_expenses_status    ON expenses (status);
CREATE INDEX idx_expenses_company   ON expenses (company_id);
CREATE INDEX idx_approval_expense   ON approval_requests (expense_id);
CREATE INDEX idx_approval_approver  ON approval_requests (approver_id, status);
CREATE INDEX idx_audit_company      ON audit_log (company_id, created_at);
CREATE INDEX idx_users_company      ON users (company_id, role);
