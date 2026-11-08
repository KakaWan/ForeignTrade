/** Global type definitions. */

// ── Product ──────────────────────────────────────────
/** 客户企业的经营业务/产品字典项（中英文对照）。
 *  注意：这里存的是**客户**经营的业务，不是我们自己的产品线。 */
export interface Product {
  id: number;
  name: string;            // 中文名
  name_en?: string;        // 英文名
  category: string;        // 分组，如「印刷服务」
  description?: string;
  sort_order: number;
  company_count: number;   // 有多少家客户企业把它列为主营业务
  created_at: string;
  updated_at: string;
}

export interface ProductCreate {
  name: string;
  name_en?: string;
  category: string;
  description?: string;
  sort_order?: number;
}

/** 企业上嵌入的主营业务项（只带展示需要的字段） */
export interface ProductBrief {
  id: number;
  name: string;
  name_en?: string;
  category: string;
}

/** 其他企业主页（X / Facebook 等） */
export interface SocialLink {
  platform: string;
  url: string;
}

// ── Company ──────────────────────────────────────────
export interface Company {
  id: number;
  name: string;
  website?: string;
  domain?: string;
  /** 主国家（= countries 的第一项，由后端同步） */
  country?: string;
  /** 多个国家，逗号+空格分隔，如 "德国, 法国" */
  countries?: string;
  region?: string;
  industry?: string;
  description?: string;
  open_email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  employee_count?: number;
  revenue?: string;
  founded_year?: number;
  linkedin?: string;
  social_links?: SocialLink[];
  notes?: string;
  extra_data?: Record<string, unknown>;
  is_favorite: boolean;
  is_blacklisted: boolean;
  status: string;
  employee_count_actual: number;
  tags: string[];
  products: ProductBrief[];
  created_at: string;
  updated_at: string;
}

export interface CompanyCreate {
  name: string;
  website?: string;
  countries?: string;
  region?: string;
  industry?: string;
  open_email?: string;
  phone?: string;
  whatsapp?: string;
  linkedin?: string;
  social_links?: SocialLink[];
  notes?: string;
  tags?: string[];
  product_ids?: number[];
}

/** 多值国家字段的统一分隔符（与后端 countries 列一致） */
export const COUNTRY_SEP = ', ';

/** 把 countries 字符串拆成国家数组（兼容顿号/斜杠等历史写法） */
export function splitCountries(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,，、;；/|\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Employee ─────────────────────────────────────────
export interface Employee {
  id: number;
  company_id?: number;
  company_name?: string;
  former_company_name?: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  position?: string;
  department?: string;
  seniority?: string;
  phone?: string;
  personal_email?: string;
  whatsapp?: string;
  linkedin?: string;
  notes?: string;
  birthday?: string;       // ISO date string (YYYY-MM-DD)
  is_favorite: boolean;
  is_blacklisted: boolean;
  status: string;
  contact_status: string;  // new/contacting/follow_up/rejected/partner
  letter_step: number;     // 0-6
  emails: EmailBrief[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ── Contact Status ──────────────────────────────────
export type ContactStatus = 'new' | 'contacting' | 'follow_up' | 'rejected' | 'partner';

export const CONTACT_STATUS_CONFIG: Record<ContactStatus, { color: string; label: string }> = {
  new: { color: 'default', label: '新建' },
  contacting: { color: 'processing', label: '联系中' },
  follow_up: { color: 'warning', label: '跟进中' },
  rejected: { color: 'error', label: '已拒绝' },
  partner: { color: 'success', label: '合作伙伴' },
};

// ── Letter Steps ────────────────────────────────────
export interface LetterStepInfo {
  step: number;
  day: number;
  purpose: string;
  purpose_en: string;
  description: string;
}

export const LETTER_STEPS: LetterStepInfo[] = [
  { step: 1, day: 1, purpose: '破冰首邮', purpose_en: 'Ice-breaker', description: '不推销、只建立关联。点明你看过他官网/店铺，一句话说清你是谁、做什么、能帮他赚什么。' },
  { step: 2, day: 4, purpose: '爆款精准推荐', purpose_en: 'Hot-product pitch', description: '让他觉得你懂他的市场。只推2-3款当地热销款，写清卖点+认证+目标价/起订量。' },
  { step: 3, day: 7, purpose: '实力信任背书', purpose_en: 'Trust building', description: '消除顾虑、建立专业度。展示认证、合作客户案例、工厂规模与交付能力。' },
  { step: 4, day: 10, purpose: '痛点提问+方案', purpose_en: 'Pain-point probing', description: '逼他回复、把对话打开。不提产品，只问真实痛点，给2选1方案让他好回复。' },
  { step: 5, day: 15, purpose: '轻提醒+小刺激', purpose_en: 'Gentle nudge', description: '温和施压、不骚扰。怕您漏看再发精简版，加弱刺激（价格波动等）。' },
  { step: 6, day: 25, purpose: '收尾留后路', purpose_en: 'Graceful close', description: '体面退场、保留未来机会。暂时不打扰，资料留底，开放入口等新品/价格变动再通知。' },
];

export interface EmailBrief {
  id: number;
  email: string;
  pattern_type?: string;
  verification_status: string;
  is_primary: boolean;
  source: string;
}

export interface EmployeeCreate {
  company_id?: number;
  first_name?: string;
  last_name?: string;
  full_name: string;
  position?: string;
  department?: string;
  seniority?: string;
  phone?: string;
  personal_email?: string;
  whatsapp?: string;
  linkedin?: string;
  notes?: string;
  birthday?: string;
}

// ── Upcoming Birthday ────────────────────────────────
export interface UpcomingBirthday {
  id: number;
  full_name: string;
  position?: string;
  company_name?: string;
  birthday: string;        // original birthday (MM-DD part)
  upcoming_date: string;   // next occurrence date
  days_away: number;       // days until next birthday
}

// ── Email ────────────────────────────────────────────
export interface EmailRecord {
  id: number;
  employee_id: number;
  email: string;
  pattern_type?: string;
  verification_status: string;
  verified_at?: string;
  mx_record?: string;
  is_primary: boolean;
  source: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EmailDeduceRequest {
  employee_id?: number;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  domain: string;
  template_group?: string;
}

export interface EmailDeduceResult {
  email: string;
  pattern_type: string;
  domain: string;
}

// ── Dev Letter ───────────────────────────────────────
export interface DevLetter {
  id: number;
  employee_id?: number;
  company_id?: number;
  email_id?: number;
  employee_name?: string;
  company_name?: string;
  content: string;
  step?: number;
  language: string;
  template_name?: string;
  ai_model?: string;
  is_sent: boolean;
  sent_at?: string;
  send_method: string;
  progress: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DevLetterGenerate {
  employee_id?: number;
  company_id?: number;
  company_name?: string;
  company_industry?: string;
  employee_name?: string;
  employee_position?: string;
  language?: string;
  custom_prompt?: string;
}

// ── Tag / Category ───────────────────────────────────
export interface Tag {
  id: number;
  name: string;
  color?: string;
  tag_type: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  parent_id?: number;
  category_type: string;
  icon?: string;
  sort_order: number;
  children?: Category[];
  created_at: string;
}

// ── FollowUp ─────────────────────────────────────────
export interface FollowUp {
  id: number;
  employee_id?: number;
  company_id?: number;
  employee_name?: string;
  company_name?: string;
  reminder_date: string;
  status: string;
  title?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ── Email Pattern ────────────────────────────────────
export interface EmailPattern {
  id: number;
  name: string;
  pattern: string;
  description?: string;
  template_group: string;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface AiPatternItem {
  name: string;
  pattern: string;
  description?: string;
}

// ── Letter Template ──────────────────────────────────
export interface LetterTemplate {
  id: number;
  name: string;
  content: string;
  step?: number;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LetterTemplateCreate {
  name: string;
  content: string;
  step?: number;
  is_default?: boolean;
  sort_order?: number;
}

// ── Sender Profile ──────────────────────────────────
export interface SenderProfile {
  id: number;
  name: string;
  company_name?: string;
  products?: string;
  website?: string;
  country?: string;
  industry?: string;
  introduction?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ── Preview Segment ──────────────────────────────────
export interface PreviewSegment {
  type: 'text' | 'data' | 'ai';
  content: string;
  field?: string;  // for type='data', which field
}

// ── Pagination ───────────────────────────────────────
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ── Dashboard ────────────────────────────────────────
/** 一天的各项操作计数（date 是调用者的本地日 YYYY-MM-DD） */
export interface DayCounts {
  date: string;
  companies: number;
  employees: number;
  emails: number;
  letters: number;
  follow_ups: number;
  imports: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface DashboardKpi {
  companies: number;
  employees: number;
  emails: number;
  emails_valid: number;
  emails_deduced: number;
  emails_manual: number;
  follow_ups_pending: number;
  letters_sent: number;
  letters_draft: number;
  favorites: number;
  today: DayCounts;
}

export interface DashboardSummary {
  kpi: DashboardKpi;
  trend: DayCounts[];
  countries: NamedCount[];
  products: NamedCount[];
  /** 下面几项目前很可能只有一个非零取值，前端据此决定画图还是显示一行汇总 */
  contact_status: NamedCount[];
  letter_steps: NamedCount[];
  email_status: NamedCount[];
}

export interface CalendarMonth {
  year: number;
  month: number;
  days: DayCounts[];
  month_totals: DayCounts;
  busiest: DayCounts[];
}

/** 日历下钻到某天的操作明细 */
export interface ActivityItem {
  type: 'company' | 'employee' | 'email' | 'letter' | 'follow_up' | 'import';
  at: string;
  title: string;
  subtitle?: string;
  entity_id?: number;
}

export interface DayActivity {
  date: string;
  counts: DayCounts;
  items: ActivityItem[];
  /** 明细每种类型最多 100 条；true 表示有类型被截断（如批量导入那天） */
  truncated: boolean;
}

// ── Settings ─────────────────────────────────────────
export interface AppSettings {
  ai_provider: string;
  ai_configured: boolean;
  anthropic_api_key: string;
  anthropic_base_url: string;
  anthropic_model: string;
  openai_api_key: string;
  openai_base_url: string;
  openai_model: string;
  ai_max_tokens: number;
  ai_temperature: number;
  db_engine: string;
  email_verify_timeout: number;
  email_verify_max_concurrent: number;
  email_verify_mode: string;
  email_verify_rate_limit: number;
  email_deduce_template_group: string;
  email_deduce_mode: string;
  default_page_size: number;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_use_tls: boolean;
  email_copy_format: string;
  backup_enabled: boolean;
  backup_interval: number;
  backup_unit: string;
  backup_keep_count: number;
}

// ── Backup ────────────────────────────────────────────
export interface BackupItem {
  filename: string;
  size: number;
  created_at: string;
  includes: string[];  // e.g. ["foreigntrade.db", "config.json"]
}
