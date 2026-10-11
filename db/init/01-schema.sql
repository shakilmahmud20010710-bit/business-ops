-- BusinessOps schema.
-- Transcribed from the class diagram in Assessment 2, Section 3.2.
-- Entities: User, Account, Category, Transaction, Invoice, Bill.
--
-- Money is stored in minor units (cents) as BIGINT, never DECIMAL or FLOAT.
-- That is design decision 3 in the proposal, and the reason is in NFR-03.

SET NAMES utf8mb4;

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('owner','staff') NOT NULL DEFAULT 'owner',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE accounts (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(120) NOT NULL,
  type                  ENUM('cash','bank') NOT NULL DEFAULT 'cash',
  opening_balance_minor BIGINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  type       ENUM('income','expense') NOT NULL,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_category (name, type)
) ENGINE=InnoDB;

CREATE TABLE invoices (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  number        VARCHAR(40)  NOT NULL UNIQUE,
  customer_name VARCHAR(160) NOT NULL,
  amount_minor  BIGINT NOT NULL,
  issue_date    DATE NOT NULL,
  due_date      DATE NOT NULL,
  status        ENUM('unpaid','paid','cancelled') NOT NULL DEFAULT 'unpaid',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_invoice_due (status, due_date)
) ENGINE=InnoDB;

CREATE TABLE bills (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  supplier_name VARCHAR(160) NOT NULL,
  amount_minor  BIGINT NOT NULL,
  due_date      DATE NOT NULL,
  status        ENUM('unpaid','paid','cancelled') NOT NULL DEFAULT 'unpaid',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bill_due (status, due_date)
) ENGINE=InnoDB;

CREATE TABLE transactions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  type         ENUM('income','expense') NOT NULL,
  amount_minor BIGINT NOT NULL,
  occurred_on  DATE NOT NULL,
  description  VARCHAR(255) NOT NULL,
  method       ENUM('cash','card','transfer','other') NOT NULL DEFAULT 'cash',
  account_id   INT NOT NULL,
  category_id  INT NOT NULL,
  invoice_id   INT NULL,
  bill_id      INT NULL,
  recorded_by  INT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_txn_date (occurred_on),
  KEY idx_txn_type_date (type, occurred_on),
  KEY idx_txn_category (category_id, occurred_on),
  CONSTRAINT fk_txn_account  FOREIGN KEY (account_id)  REFERENCES accounts(id),
  CONSTRAINT fk_txn_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_txn_invoice  FOREIGN KEY (invoice_id)  REFERENCES invoices(id) ON DELETE SET NULL,
  CONSTRAINT fk_txn_bill     FOREIGN KEY (bill_id)     REFERENCES bills(id) ON DELETE SET NULL,
  CONSTRAINT fk_txn_user     FOREIGN KEY (recorded_by) REFERENCES users(id),
  CONSTRAINT chk_txn_amount  CHECK (amount_minor > 0)
) ENGINE=InnoDB;

-- FR-08. "Editing keeps the previous values as a record of the change."
-- A cash ledger that can be silently rewritten is not a record of anything, so every
-- edit and deletion writes the prior state here before the change is applied.
CREATE TABLE transaction_audit (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  action         ENUM('update','delete') NOT NULL,
  changed_by     INT NOT NULL,
  previous       JSON NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_txn (transaction_id, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- The details that appear at the top of a printed invoice.
-- A single row: BusinessOps is deliberately single-business (multi-business was a
-- Won't-have in the proposal), so there is no tenant key here.
CREATE TABLE business_profile (
  id          TINYINT PRIMARY KEY DEFAULT 1,
  name        VARCHAR(160) NOT NULL,
  address     VARCHAR(400),
  email       VARCHAR(190),
  phone       VARCHAR(60),
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_single_business CHECK (id = 1)
) ENGINE=InnoDB;
