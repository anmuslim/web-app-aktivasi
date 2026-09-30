
import { OLTConfig } from './types';

/**
 * Initial OLT Configuration
 * Starting with an empty object as requested.
 * Add nodes via the Admin Management panel.
 */
export const INITIAL_OLT_CONFIG: Record<string, OLTConfig> = {};

/**
 * Initial Templates
 * Starting with an empty object.
 * You can define your own ZTE/Huawei/Nokia templates in the Settings.
 */
export const INITIAL_TEMPLATES: Record<string, string> = {};
