
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

export type NavMenu = 'generator' | 'olt' | 'area' | 'template' | 'shortcut' | 'speed' | 'user';

export interface RolePermission {
  id: string; // e.g. 'admin', 'operator', 'teknisi' or custom id
  name: string; // Display name, e.g. 'Administrator', 'Operator NOC', 'Teknisi Lapangan'
  description?: string;
  allowedMenus: NavMenu[]; // list of accessible menu IDs
  canEditOtherUsers: boolean; // akses untuk mengubah username / akun pengguna lain
  canDeleteUsers?: boolean; // akses untuk menghapus akun pengguna
  canManageRoles?: boolean; // akses untuk mengelola master role & hak akses
  isSystem?: boolean; // default system role
}

export interface User {
  id: string;
  username: string;
  name: string;
  password?: string;
  role: string;
  createdAt?: string;
}


