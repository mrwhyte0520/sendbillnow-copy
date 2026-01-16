import { supabase } from '../../lib/supabase';

// =============================================================================
// TYPES
// =============================================================================

export interface Role {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  user_id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  hire_date: string;
  termination_date: string | null;
  status: 'active' | 'inactive' | 'terminated';
  default_role_id: string | null;
  created_at: string;
  updated_at: string;
  role?: Role;
}

export interface EmployeeRoleHistory {
  id: string;
  user_id: string;
  employee_id: string;
  role_id: string;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
  created_at: string;
  employee?: Employee;
  role?: Role;
}

export interface TimeClockEntry {
  id: string;
  user_id: string;
  employee_id: string;
  location_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  source: 'pos' | 'mobile' | 'admin' | 'kiosk';
  created_at: string;
  employee?: Employee;
}

export interface CreateEmployeePayload {
  user_id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  hire_date: string;
  status?: 'active' | 'inactive' | 'terminated';
  default_role_id?: string | null;
}

export interface UpdateEmployeePayload {
  employee_no?: string;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  hire_date?: string;
  termination_date?: string | null;
  status?: 'active' | 'inactive' | 'terminated';
  default_role_id?: string | null;
}

export interface CreateRolePayload {
  user_id: string;
  name: string;
  description?: string | null;
}

export interface CreateTimeClockPayload {
  user_id: string;
  employee_id: string;
  location_id?: string | null;
  clock_in: string;
  clock_out?: string | null;
  break_minutes?: number;
  source?: 'pos' | 'mobile' | 'admin' | 'kiosk';
}

// =============================================================================
// ROLES SERVICE
// =============================================================================

export const rolesService = {
  async list(userId: string): Promise<Role[]> {
    const { data, error } = await supabase
      .from('contador_roles')
      .select('*')
      .eq('user_id', userId)
      .order('name');

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Role | null> {
    const { data, error } = await supabase
      .from('contador_roles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload: CreateRolePayload): Promise<Role> {
    const { data, error } = await supabase
      .from('contador_roles')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<CreateRolePayload>): Promise<Role> {
    const { data, error } = await supabase
      .from('contador_roles')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_roles')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// EMPLOYEES SERVICE
// =============================================================================

export const employeesService = {
  async list(userId: string, filters?: { status?: string }): Promise<Employee[]> {
    let query = supabase
      .from('contador_employees')
      .select(`
        *,
        role:contador_roles(id, name)
      `)
      .eq('user_id', userId)
      .order('last_name')
      .order('first_name');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Employee | null> {
    const { data, error } = await supabase
      .from('contador_employees')
      .select(`
        *,
        role:contador_roles(id, name, description)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload: CreateEmployeePayload): Promise<Employee> {
    const { data, error } = await supabase
      .from('contador_employees')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, payload: UpdateEmployeePayload): Promise<Employee> {
    const { data, error } = await supabase
      .from('contador_employees')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async terminate(id: string, terminationDate: string): Promise<Employee> {
    const { data, error } = await supabase
      .from('contador_employees')
      .update({
        status: 'terminated',
        termination_date: terminationDate,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_employees')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getActiveCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('contador_employees')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) throw error;
    return count || 0;
  },
};

// =============================================================================
// EMPLOYEE ROLE HISTORY SERVICE
// =============================================================================

export const employeeRoleHistoryService = {
  async listByEmployee(employeeId: string): Promise<EmployeeRoleHistory[]> {
    const { data, error } = await supabase
      .from('contador_employee_role_history')
      .select(`
        *,
        role:contador_roles(id, name)
      `)
      .eq('employee_id', employeeId)
      .order('effective_from', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async create(payload: {
    user_id: string;
    employee_id: string;
    role_id: string;
    effective_from: string;
    effective_to?: string | null;
    note?: string | null;
  }): Promise<EmployeeRoleHistory> {
    const { data, error } = await supabase
      .from('contador_employee_role_history')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async endRole(id: string, effectiveTo: string): Promise<EmployeeRoleHistory> {
    const { data, error } = await supabase
      .from('contador_employee_role_history')
      .update({ effective_to: effectiveTo })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

// =============================================================================
// TIME CLOCK SERVICE
// =============================================================================

export const timeClockService = {
  async list(
    userId: string,
    filters?: {
      employeeId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<TimeClockEntry[]> {
    let query = supabase
      .from('contador_time_clock_entries')
      .select(`
        *,
        employee:contador_employees(id, first_name, last_name, employee_no)
      `)
      .eq('user_id', userId)
      .order('clock_in', { ascending: false });

    if (filters?.employeeId) {
      query = query.eq('employee_id', filters.employeeId);
    }
    if (filters?.startDate) {
      query = query.gte('clock_in', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('clock_in', filters.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async clockIn(payload: CreateTimeClockPayload): Promise<TimeClockEntry> {
    const { data, error } = await supabase
      .from('contador_time_clock_entries')
      .insert({
        ...payload,
        clock_in: payload.clock_in || new Date().toISOString(),
        source: payload.source || 'admin',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async clockOut(id: string, clockOut?: string): Promise<TimeClockEntry> {
    const { data, error } = await supabase
      .from('contador_time_clock_entries')
      .update({
        clock_out: clockOut || new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateBreakMinutes(id: string, breakMinutes: number): Promise<TimeClockEntry> {
    const { data, error } = await supabase
      .from('contador_time_clock_entries')
      .update({ break_minutes: breakMinutes })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_time_clock_entries')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getOpenEntry(employeeId: string): Promise<TimeClockEntry | null> {
    const { data, error } = await supabase
      .from('contador_time_clock_entries')
      .select('*')
      .eq('employee_id', employeeId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async getTotalHours(
    employeeId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    const { data, error } = await supabase
      .from('contador_time_clock_entries')
      .select('clock_in, clock_out, break_minutes')
      .eq('employee_id', employeeId)
      .gte('clock_in', startDate)
      .lte('clock_in', endDate)
      .not('clock_out', 'is', null);

    if (error) throw error;

    let totalMinutes = 0;
    for (const entry of data || []) {
      if (entry.clock_out) {
        const clockIn = new Date(entry.clock_in).getTime();
        const clockOut = new Date(entry.clock_out).getTime();
        const workedMinutes = (clockOut - clockIn) / (1000 * 60);
        totalMinutes += workedMinutes - (entry.break_minutes || 0);
      }
    }

    return totalMinutes / 60; // Return hours
  },
};

// =============================================================================
// EXPORT ALL
// =============================================================================

export const staffService = {
  roles: rolesService,
  employees: employeesService,
  roleHistory: employeeRoleHistoryService,
  timeClock: timeClockService,
};

export default staffService;
