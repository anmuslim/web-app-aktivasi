
export type TemplateType = string;

export interface SubTabConfig {
  vlan: number;
  ppp_prefix: string;
  ip_olt: string;
  vlanProfile: string;
  speedProfile: string;
  template: TemplateType;
}

export interface OLTConfig {
  code: string;
  username?: string;
  password?: string;
  subtabs: Record<string, SubTabConfig>;
}

export interface ScriptData {
  slot: string;
  port: string;
  onu: string;
  sn: string;
  odp: string;
  profile: string;
  vlan: number;
  vlanProfile: string;
  pppoe: string;
  locks: string;
  vlanLines: string;
  [key: string]: any;
}
