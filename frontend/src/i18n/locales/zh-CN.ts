import zhCN from 'antd/locale/zh_CN';

import type { LanguagePack } from '../types';

/**
 * Chinese is the source language: the key itself is the displayed text.
 * `messages` can stay empty; missing keys fall back to the key.
 */
export const zhCNPack: LanguagePack = {
  code: 'zh-CN',
  label: '中文',
  antdLocale: zhCN,
  dayjsLocale: 'zh-cn',
  messages: {},
};
