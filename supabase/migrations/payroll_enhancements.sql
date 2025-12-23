-- =====================================================
-- Payroll Module Enhancement Tables
-- Created: 2024-12-23
-- Description: Tables for salary changes and employee exits
-- =====================================================

-- Salary Changes Table
-- Tracks all salary changes/adjustments for employees
CREATE TABLE IF NOT EXISTS salary_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL,
    employee_name VARCHAR(255),
    employee_code VARCHAR(50),
    department VARCHAR(255),
    position VARCHAR(255),
    previous_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
    new_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
    change_type VARCHAR(50) DEFAULT 'adjustment', -- increase, decrease, promotion, adjustment
    change_percentage DECIMAL(10, 4) DEFAULT 0,
    effective_date DATE NOT NULL,
    reason TEXT,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, applied
    approved_by VARCHAR(255),
    approved_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_salary_changes_user_id ON salary_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_changes_employee_id ON salary_changes(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_changes_status ON salary_changes(status);
CREATE INDEX IF NOT EXISTS idx_salary_changes_effective_date ON salary_changes(effective_date);

-- Enable RLS
ALTER TABLE salary_changes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own salary changes" ON salary_changes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own salary changes" ON salary_changes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own salary changes" ON salary_changes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own salary changes" ON salary_changes
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- Employee Exits Table
-- Tracks employee separations and settlement calculations
-- =====================================================

CREATE TABLE IF NOT EXISTS employee_exits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL,
    employee_name VARCHAR(255),
    employee_code VARCHAR(50),
    department VARCHAR(255),
    position VARCHAR(255),
    hire_date DATE,
    exit_date DATE NOT NULL,
    exit_type VARCHAR(50) DEFAULT 'resignation', -- resignation, termination, retirement, contract_end, mutual_agreement, death
    reason TEXT,
    last_salary DECIMAL(15, 2) DEFAULT 0,
    years_of_service DECIMAL(10, 2) DEFAULT 0,
    pending_vacation_days INTEGER DEFAULT 0,
    vacation_payout DECIMAL(15, 2) DEFAULT 0,
    christmas_bonus_payout DECIMAL(15, 2) DEFAULT 0, -- Regalía Pascual proporcional
    severance_pay DECIMAL(15, 2) DEFAULT 0, -- Preaviso + Cesantía
    other_payments DECIMAL(15, 2) DEFAULT 0,
    total_settlement DECIMAL(15, 2) DEFAULT 0,
    deductions DECIMAL(15, 2) DEFAULT 0,
    net_settlement DECIMAL(15, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, paid, cancelled
    approved_by VARCHAR(255),
    approved_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_employee_exits_user_id ON employee_exits(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_exits_employee_id ON employee_exits(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_exits_status ON employee_exits(status);
CREATE INDEX IF NOT EXISTS idx_employee_exits_exit_date ON employee_exits(exit_date);
CREATE INDEX IF NOT EXISTS idx_employee_exits_exit_type ON employee_exits(exit_type);

-- Enable RLS
ALTER TABLE employee_exits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own employee exits" ON employee_exits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own employee exits" ON employee_exits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own employee exits" ON employee_exits
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own employee exits" ON employee_exits
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- Add new columns to payroll_settings if not exists
-- =====================================================

-- Add columns for additional accounting accounts
DO $$ 
BEGIN
    -- Overtime Payable Account
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payroll_settings' AND column_name = 'overtime_payable_account_id') THEN
        ALTER TABLE payroll_settings ADD COLUMN overtime_payable_account_id UUID;
    END IF;

    -- Incentives Payable Account
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payroll_settings' AND column_name = 'incentives_payable_account_id') THEN
        ALTER TABLE payroll_settings ADD COLUMN incentives_payable_account_id UUID;
    END IF;

    -- Vacation Payable Account
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payroll_settings' AND column_name = 'vacation_payable_account_id') THEN
        ALTER TABLE payroll_settings ADD COLUMN vacation_payable_account_id UUID;
    END IF;

    -- INFOTEP Payable Account
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payroll_settings' AND column_name = 'infotep_payable_account_id') THEN
        ALTER TABLE payroll_settings ADD COLUMN infotep_payable_account_id UUID;
    END IF;

    -- Overtime Expense Account
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payroll_settings' AND column_name = 'overtime_expense_account_id') THEN
        ALTER TABLE payroll_settings ADD COLUMN overtime_expense_account_id UUID;
    END IF;

    -- Incentives Expense Account
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payroll_settings' AND column_name = 'incentives_expense_account_id') THEN
        ALTER TABLE payroll_settings ADD COLUMN incentives_expense_account_id UUID;
    END IF;

    -- Vacation Expense Account
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payroll_settings' AND column_name = 'vacation_expense_account_id') THEN
        ALTER TABLE payroll_settings ADD COLUMN vacation_expense_account_id UUID;
    END IF;

    -- INFOTEP Expense Account
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payroll_settings' AND column_name = 'infotep_expense_account_id') THEN
        ALTER TABLE payroll_settings ADD COLUMN infotep_expense_account_id UUID;
    END IF;
END $$;

-- =====================================================
-- Trigger for updated_at timestamps
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to salary_changes
DROP TRIGGER IF EXISTS update_salary_changes_updated_at ON salary_changes;
CREATE TRIGGER update_salary_changes_updated_at
    BEFORE UPDATE ON salary_changes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to employee_exits
DROP TRIGGER IF EXISTS update_employee_exits_updated_at ON employee_exits;
CREATE TRIGGER update_employee_exits_updated_at
    BEFORE UPDATE ON employee_exits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE salary_changes IS 'Tracks salary changes and adjustments for employees';
COMMENT ON TABLE employee_exits IS 'Tracks employee separations and settlement calculations';

COMMENT ON COLUMN salary_changes.change_type IS 'Type of change: increase, decrease, promotion, adjustment';
COMMENT ON COLUMN salary_changes.status IS 'Status: pending, approved, rejected, applied';

COMMENT ON COLUMN employee_exits.exit_type IS 'Type of exit: resignation, termination, retirement, contract_end, mutual_agreement, death';
COMMENT ON COLUMN employee_exits.severance_pay IS 'Preaviso + Cesantía according to Dominican Labor Law';
COMMENT ON COLUMN employee_exits.christmas_bonus_payout IS 'Regalía Pascual proporcional (12va parte)';
