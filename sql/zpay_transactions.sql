-- ============================================
-- zpay_transactions 表
-- 用于存储 zpay 支付交易记录
-- ============================================

CREATE TABLE IF NOT EXISTS zpay_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 用户信息
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 产品信息
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,                    -- 商品名称
  
  -- 订单信息
  out_trade_no TEXT NOT NULL UNIQUE,     -- 商户订单号（我方生成）
  trade_no TEXT,                          -- 易支付订单号（支付成功后由zpay返回）
  money DECIMAL(10, 2) NOT NULL,         -- 订单金额
  type TEXT NOT NULL DEFAULT 'alipay',   -- 支付方式: alipay, wxpay
  status TEXT NOT NULL DEFAULT 'pending', -- 订单状态: pending(待支付), paid(已支付), failed(失败)
  
  -- 订阅信息
  is_subscription BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否为订阅类型
  subscription_period TEXT,                         -- 订阅周期: monthly, yearly, null(一次性)
  subscription_start_date TIMESTAMPTZ,              -- 订阅开始时间
  subscription_end_date TIMESTAMPTZ,                -- 订阅结束时间
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- 索引
-- ============================================

-- 按用户ID查询
CREATE INDEX idx_zpay_transactions_user_id ON zpay_transactions(user_id);

-- 按商户订单号查询（唯一索引已由UNIQUE约束自动创建）
CREATE INDEX idx_zpay_transactions_out_trade_no ON zpay_transactions(out_trade_no);

-- 按订单状态查询
CREATE INDEX idx_zpay_transactions_status ON zpay_transactions(status);

-- 按用户订阅状态查询（用于计算订阅续期的开始时间）
CREATE INDEX idx_zpay_transactions_subscription 
  ON zpay_transactions(user_id, is_subscription, status, subscription_end_date)
  WHERE is_subscription = TRUE AND status = 'paid';

-- ============================================
-- 行级安全策略 (RLS)
-- ============================================

ALTER TABLE zpay_transactions ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的交易记录
CREATE POLICY "Users can view their own transactions"
  ON zpay_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- 注意：INSERT/UPDATE/DELETE 操作通过 createServerAdminClient (service_role) 执行，
-- service_role 默认绕过 RLS，因此不需要额外的写入策略。
