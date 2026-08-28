-- 002：PIN 独立失败计数与锁定（与登录锁定分离）
ALTER TABLE users ADD COLUMN pin_failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN pin_locked_until TEXT;
