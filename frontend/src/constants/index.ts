/** Predefined options for country and industry fields.
 *  Merged at runtime with values already in the database,
 *  and presented as AutoComplete suggestions so users can also type freely.
 */

// ── Countries ─────────────────────────────────────────
// Sorted roughly by trading volume with China; covers all major economies.
export const COUNTRIES = [
  // 东亚
  '日本', '韩国', '中国台湾', '中国香港', '中国澳门',
  // 东南亚
  '越南', '泰国', '印度尼西亚', '马来西亚', '菲律宾', '新加坡', '缅甸', '柬埔寨', '老挝', '文莱',
  // 南亚
  '印度', '巴基斯坦', '孟加拉国', '斯里兰卡', '尼泊尔',
  // 中亚/西亚
  '哈萨克斯坦', '乌兹别克斯坦', '土耳其', '以色列', '沙特阿拉伯', '阿联酋', '伊朗', '伊拉克', '卡塔尔', '科威特', '阿曼', '巴林', '约旦', '黎巴嫩',
  // 西欧
  '德国', '法国', '英国', '荷兰', '比利时', '卢森堡', '瑞士', '奥地利', '爱尔兰', '葡萄牙', '西班牙', '意大利', '希腊', '丹麦', '瑞典', '挪威', '芬兰', '冰岛',
  // 东欧
  '波兰', '捷克', '匈牙利', '罗马尼亚', '保加利亚', '斯洛伐克', '斯洛文尼亚', '克罗地亚', '塞尔维亚', '乌克兰', '俄罗斯', '白俄罗斯', '立陶宛', '拉脱维亚', '爱沙尼亚',
  // 北美
  '美国', '加拿大', '墨西哥',
  // 中美/加勒比
  '古巴', '多米尼加', '哥斯达黎加', '巴拿马',
  // 南美
  '巴西', '阿根廷', '智利', '哥伦比亚', '秘鲁', '委内瑞拉', '厄瓜多尔', '乌拉圭', '巴拉圭', '玻利维亚',
  // 非洲
  '南非', '尼日利亚', '埃及', '肯尼亚', '摩洛哥', '阿尔及利亚', '坦桑尼亚', '加纳', '埃塞俄比亚', '安哥拉', '刚果(金)', '莫桑比克', '马达加斯加',
  // 大洋洲
  '澳大利亚', '新西兰',
  // 英文名（部分客户习惯用英文）
  'Japan', 'South Korea', 'Taiwan', 'Hong Kong',
  'Vietnam', 'Thailand', 'Indonesia', 'Malaysia', 'Philippines', 'Singapore',
  'India', 'Pakistan', 'Turkey', 'Israel', 'Saudi Arabia', 'UAE',
  'Germany', 'France', 'UK', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Italy', 'Spain', 'Portugal',
  'Poland', 'Czech Republic', 'Hungary', 'Romania', 'Ukraine', 'Russia',
  'USA', 'Canada', 'Mexico',
  'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru',
  'South Africa', 'Nigeria', 'Egypt', 'Kenya', 'Morocco',
  'Australia', 'New Zealand',
] as const;

// ── Industries ────────────────────────────────────────
// Common foreign-trade industry categories (Chinese + English)
export const INDUSTRIES = [
  // 制造业大类
  '印刷', '包装', '纺织', '服装', '鞋帽', '箱包', '玩具', '家具', '建材', '陶瓷', '玻璃',
  '五金', '机械', '机床', '模具', '轴承', '阀门', '泵', '电机', '发电机', '压缩机',
  '电子', '半导体', '集成电路', 'PCB', '线缆', '连接器', '传感器', 'LED', '光伏', '电池',
  '汽车零部件', '新能源汽车', '摩托车', '自行车', '电动车',
  '钢铁', '铝材', '铜材', '不锈钢', '合金', '铸造', '锻造', '冲压', '注塑', '挤出',
  '化工', '塑料', '橡胶', '涂料', '油漆', '胶粘剂', '日化', '医药', '农药', '化肥',
  '食品加工', '饮料', '农产品', '水产品', '茶叶', '咖啡', '调味品', '罐头', '冷冻食品',
  '木材', '纸业', '纸箱', '印刷设备', '广告设备', '标识标牌', '展示器材',
  // 服务/贸易类
  '外贸', '进出口', '贸易', '物流', '货运', '仓储', '供应链', '跨境电商',
  'IT服务', '软件开发', '通信', '安防', '自动化', '机器人', 'AI/人工智能',
  '建筑', '工程', '装饰', '园林', '环保', '水处理', '废物处理',
  '金融', '保险', '咨询', '法律', '会计', '人力资源',
  '医疗', '医疗器械', '保健', '养老', '教育', '培训',
  '旅游', '酒店', '餐饮', '娱乐', '文化', '传媒', '出版',
  // 英文
  'Printing', 'Packaging', 'Textile', 'Garment', 'Footwear', 'Toys', 'Furniture',
  'Machinery', 'Hardware', 'Electronics', 'Semiconductor', 'Automotive Parts',
  'Steel', 'Aluminum', 'Chemical', 'Plastic', 'Rubber', 'Pharmaceutical',
  'Food Processing', 'Agriculture', 'Wood', 'Paper',
  'Trading', 'Logistics', 'Cross-border E-commerce',
  'IT Services', 'Software', 'Telecom', 'Automation', 'Robotics',
  'Construction', 'Engineering', 'Environmental',
  'Medical Devices', 'Healthcare', 'Education',
  'Tourism', 'Hospitality', 'Media', 'Publishing',
] as const;

/** Merge frequent values (from DB, already sorted by count desc) with predefined list.
 *  Frequent values come first, then remaining predefined values sorted alphabetically.
 */
export function mergeOptions(frequent: readonly string[], predefined: readonly string[]): string[] {
  const seen = new Set<string>(frequent);
  const rest = predefined.filter(v => !seen.has(v)).sort((a, b) => a.localeCompare(b, 'zh-Hans'));
  return [...frequent, ...rest];
}
