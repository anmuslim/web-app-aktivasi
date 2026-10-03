import { OLTConfig, User, RolePermission, NavMenu } from './types';

/**
 * All Navigation Menus for Permission Checklist
 */
export const ALL_NAV_MENUS: { id: NavMenu; label: string; desc: string }[] = [
  { id: 'generator', label: 'Generator & Terminal', desc: 'Aktivasi OLT, script GPON & live CLI terminal' },
  { id: 'olt', label: 'Manajemen OLT', desc: 'Kelola data OLT, IP address & kredensial' },
  { id: 'area', label: 'Area & VLAN', desc: 'Kelola sub-area, VLAN ID & PPP prefix' },
  { id: 'template', label: 'Template Script', desc: 'Script designer GPON & placeholder otomatis' },
  { id: 'shortcut', label: 'Shortcut Terminal', desc: 'Koleksi perintah cepat CLI OLT' },
  { id: 'speed', label: 'Profile / Speed', desc: 'Daftar paket kecepatan internet' },
  { id: 'user', label: 'Manajemen User', desc: 'Akun petugas, peran master & hak akses' },
];

/**
 * Initial Master Roles & Permissions
 */
export const DEFAULT_ROLES: RolePermission[] = [
  {
    id: 'admin',
    name: 'Administrator (Super User)',
    description: 'Akses penuh ke seluruh menu sistem, manajemen role, dan wewenang mengubah data pengguna lain.',
    allowedMenus: ['generator', 'olt', 'area', 'template', 'shortcut', 'speed', 'user'],
    canEditOtherUsers: true,
    canDeleteUsers: true,
    canManageRoles: true,
    isSystem: true
  },
  {
    id: 'operator',
    name: 'Operator NOC',
    description: 'Akses operasional jaringan OLT, Area & VLAN, Template GPON, dan Paket Speed.',
    allowedMenus: ['generator', 'olt', 'area', 'template', 'shortcut', 'speed'],
    canEditOtherUsers: false,
    canDeleteUsers: false,
    canManageRoles: false,
    isSystem: true
  },
  {
    id: 'teknisi',
    name: 'Teknisi Lapangan',
    description: 'Akses aktivasi ONT via Generator Script dan Shortcut diagnostik CLI Terminal.',
    allowedMenus: ['generator', 'shortcut'],
    canEditOtherUsers: false,
    canDeleteUsers: false,
    canManageRoles: false,
    isSystem: true
  }
];

/**
 * Initial Speed Profiles
 */
export const DEFAULT_SPEED_PROFILES: string[] = [
  'INTERNET_10M',
  'INTERNET_20M',
  'INTERNET_30M',
  'INTERNET_50M',
  'INTERNET_100M',
  'INTERNET_150M',
  'INTERNET_200M'
];

/**
 * Initial Users
 */
export const DEFAULT_USERS: User[] = [
  {
    id: '1',
    username: 'admin',
    name: 'Administrator',
    password: 'admin',
    role: 'admin',
    createdAt: '2026-09-30T00:00:00.000Z'
  }
];

/**
 * Initial OLT Configuration
 * Lengkap dengan data node OLT dan pemetaan Area & VLAN
 */
export const INITIAL_OLT_CONFIG: Record<string, OLTConfig> = {
  "A1-NGAMPEL-DYG": {
    "code": "A1-NGPL-DYG - 10.123.123.15",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "D1A": {
        "vlan": 1010,
        "ppp_prefix": "A1X1A",
        "ip_olt": "10.123.123.15",
        "vlanProfile": "PPPoE1010",
        "speedProfile": "",
        "template": "STANDAR"
      },
      "D1C": {
        "vlan": 1012,
        "ppp_prefix": "A1X1C",
        "ip_olt": "10.123.123.15",
        "vlanProfile": "PPPoE1012",
        "speedProfile": "",
        "template": "STANDAR"
      }
    }
  },
  "A2-NGAMPEL-PNKL": {
    "code": "A2-NGPL-PNKL - 10.123.123.16",
    "username": "",
    "password": "",
    "subtabs": {}
  },
  "A3-NGAMPEL-KTN": {
    "code": "A3-NGPL-KTN - 10.123.123.155",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "D1E": {
        "vlan": 1014,
        "ppp_prefix": "A3X1E",
        "ip_olt": "10.123.123.155",
        "vlanProfile": "PPPoE1014",
        "speedProfile": "",
        "template": "STANDAR"
      }
    }
  },
  "B1-SUMBEREJO-SBR": {
    "code": "B1-SBR-SBR - 10.123.123.35",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "D3A": {
        "vlan": 1032,
        "ppp_prefix": "B1X3A",
        "ip_olt": "10.123.123.35",
        "vlanProfile": "PPPoE1032",
        "speedProfile": "",
        "template": "STANDAR"
      },
      "D3B": {
        "vlan": 1031,
        "ppp_prefix": "B1X3B",
        "ip_olt": "10.123.123.35",
        "vlanProfile": "PPPoE1031",
        "speedProfile": "",
        "template": "STANDAR"
      },
      "D3C": {
        "vlan": 1030,
        "ppp_prefix": "B1X3C",
        "ip_olt": "10.123.123.35",
        "vlanProfile": "PPPoE1030",
        "speedProfile": "",
        "template": "STANDAR"
      },
      "D3D": {
        "vlan": 1033,
        "ppp_prefix": "B1X3D",
        "ip_olt": "10.123.123.35",
        "vlanProfile": "PPPoE1033",
        "speedProfile": "",
        "template": "STANDAR"
      }
    }
  },
  "C1-JETIS-JTS": {
    "code": "C1-JTS-JTS - 10.123.123.45",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "D4A": {
        "vlan": 1042,
        "ppp_prefix": "C1X4A",
        "ip_olt": "10.123.123.45",
        "vlanProfile": "PPPoE1042",
        "speedProfile": "",
        "template": "STANDAR"
      },
      "D4B": {
        "vlan": 1041,
        "ppp_prefix": "C1X4B",
        "ip_olt": "10.123.123.45",
        "vlanProfile": "PPPoE1041",
        "speedProfile": "",
        "template": "STANDAR"
      },
      "D4C": {
        "vlan": 1040,
        "ppp_prefix": "C1X4C",
        "ip_olt": "10.123.123.45",
        "vlanProfile": "PPPoE1040",
        "speedProfile": "",
        "template": "STANDAR"
      },
      "D4D": {
        "vlan": 1043,
        "ppp_prefix": "C1X4D",
        "ip_olt": "10.123.123.45",
        "vlanProfile": "PPPoE1043",
        "speedProfile": "",
        "template": "STANDAR"
      }
    }
  },
  "D1-SIMAN-PBSN": {
    "code": "D1-SMN-PBSN - 10.10.55.2",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "D6A": {
        "vlan": 1060,
        "ppp_prefix": "D1X6A",
        "ip_olt": "10.10.55.2",
        "vlanProfile": "PPPoE1060",
        "speedProfile": "",
        "template": "STANDAR"
      },
      "D6B": {
        "vlan": 1061,
        "ppp_prefix": "D1X6B",
        "ip_olt": "10.10.55.2",
        "vlanProfile": "PPPoE1061",
        "speedProfile": "",
        "template": "STANDAR"
      }
    }
  },
  "E1-SLAHUNG-SLH": {
    "code": "E1-SLH-SLH - 10.123.123.75",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "D7A": {
        "vlan": 1070,
        "ppp_prefix": "E1X7A",
        "ip_olt": "10.123.123.75",
        "vlanProfile": "PPPoE1070",
        "speedProfile": "",
        "template": "STANDAR"
      },
      "D7B": {
        "vlan": 1071,
        "ppp_prefix": "E1X7B",
        "ip_olt": "10.123.123.75",
        "vlanProfile": "PPPoE1071",
        "speedProfile": "",
        "template": "STANDAR"
      }
    }
  },
  "F1-TEMON-SNRG": {
    "code": "F1-TMN-SNRG - 10.123.123.55",
    "username": "",
    "password": "",
    "subtabs": {}
  },
  "F2-TEMON-SNRG": {
    "code": "F2-TMN-SNRG - 10.123.123.56",
    "username": "",
    "password": "",
    "subtabs": {}
  },
  "G1-SAMBIT-BDG": {
    "code": "G1-SMBT-BDG - 10.10.99.3",
    "username": "",
    "password": "",
    "subtabs": {}
  },
  "H1-PACITAN-PLS": {
    "code": "H1-PCT-PLS - 10.10.88.2",
    "username": "",
    "password": "",
    "subtabs": {}
  },
  "H2-PACITAN-GMH": {
    "code": "H2-PCT-GMH - 10.10.111.2",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "D8B": {
        "vlan": 1100,
        "ppp_prefix": "H2X8B",
        "ip_olt": "10.10.111.2",
        "vlanProfile": "PPPoE1100",
        "speedProfile": "",
        "template": "STANDAR"
      }
    }
  },
  "H3-PACITAN-PCO": {
    "code": "H3-PCT-PCO - 10.10.112.2",
    "username": "",
    "password": "",
    "subtabs": {}
  },
  "H4-PACITAN-TGO": {
    "code": "H4-PCT-TGO - 10.10.114.2",
    "username": "",
    "password": "",
    "subtabs": {}
  },
  "I1-CARUBAN-PLKC": {
    "code": "I1-CRB-PLKC - 10.123.123.135",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "D13A": {
        "vlan": 1130,
        "ppp_prefix": "I1X13A",
        "ip_olt": "10.123.123.135",
        "vlanProfile": "vlan1130",
        "speedProfile": "",
        "template": "STANDAR"
      }
    }
  },
  "SANDYA-SMN": {
    "code": "SANDYA-SMN - 10.10.55.2",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "VLAN-168": {
        "vlan": 168,
        "ppp_prefix": "J1X",
        "ip_olt": "10.10.55.2",
        "vlanProfile": "",
        "speedProfile": "",
        "template": "SANDYA"
      },
      "VLAN-170": {
        "vlan": 170,
        "ppp_prefix": "J1X",
        "ip_olt": "10.10.55.2",
        "vlanProfile": "",
        "speedProfile": "",
        "template": "SANDYA"
      },
      "VLAN-803": {
        "vlan": 803,
        "ppp_prefix": "J1X",
        "ip_olt": "10.10.55.2",
        "vlanProfile": "",
        "speedProfile": "",
        "template": "SANDYA"
      }
    }
  },
  "SANDYA-KTN": {
    "code": "SANDYA-KTN - 10.123.123.155",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "VLAN-168": {
        "vlan": 168,
        "ppp_prefix": "J1X",
        "ip_olt": "10.123.123.155",
        "vlanProfile": "",
        "speedProfile": "",
        "template": "SANDYA"
      },
      "VLAN-170": {
        "vlan": 170,
        "ppp_prefix": "J1X",
        "ip_olt": "10.123.123.155",
        "vlanProfile": "",
        "speedProfile": "",
        "template": "SANDYA"
      },
      "VLAN-803": {
        "vlan": 803,
        "ppp_prefix": "J1X",
        "ip_olt": "10.123.123.155",
        "vlanProfile": "",
        "speedProfile": "",
        "template": "SANDYA"
      }
    }
  },
  "SANDYA-JTS": {
    "code": "SANDYA-JTS - 10.123.123.45",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "VLAN-168": {
        "vlan": 168,
        "ppp_prefix": "J1X",
        "ip_olt": "10.123.123.45",
        "vlanProfile": "",
        "speedProfile": "",
        "template": "SANDYA"
      },
      "VLAN-170": {
        "vlan": 170,
        "ppp_prefix": "J1X",
        "ip_olt": "10.123.123.45",
        "vlanProfile": "",
        "speedProfile": "",
        "template": "SANDYA"
      },
      "VLAN-803": {
        "vlan": 803,
        "ppp_prefix": "J1X",
        "ip_olt": "10.123.123.45",
        "vlanProfile": "",
        "speedProfile": "",
        "template": "SANDYA"
      }
    }
  },
  "MAZZNET-SMN": {
    "code": "MAZZNET-SMN - 10.10.55.2",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "VLAN-696": {
        "vlan": 696,
        "ppp_prefix": "",
        "ip_olt": "10.10.55.2",
        "vlanProfile": "696-OPENPORTMAZZNET",
        "speedProfile": "",
        "template": "MAZZNET"
      }
    }
  },
  "MAZZNET-KTN": {
    "code": "MAZZNET-KTN - 10.123.123.155",
    "username": "wholtgnrt",
    "password": "whusnet#123",
    "subtabs": {
      "VLAN-696": {
        "vlan": 696,
        "ppp_prefix": "",
        "ip_olt": "10.123.123.155",
        "vlanProfile": "696-OPENPORTMAZZNET",
        "speedProfile": "",
        "template": "MAZZNET"
      }
    }
  }
};

/**
 * Initial Templates
 */
export const INITIAL_TEMPLATES: Record<string, string> = {
  "STANDAR": `interface gpon-olt_1/{slot}/{port}
onu {onu} type ALL sn {sn}
exit

interface gpon-onu_1/{slot}/{port}:{onu}
name {odp}_{pppoe}
tcont 1 name INET profile {profile}
gemport 1 name INET tcont 1
gemport 1 traffic-limit upstream {profile} downstream {profile}
service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
exit

pon-onu-mng gpon-onu_1/{slot}/{port}:{onu}
service INET gemport 1 vlan {vlan}
{locks}

firewall enable level low
security-mgmt 1 state enable mode forward ingress-type wan protocol web
wan-ip mode pppoe username {pppoe} password 740874 vlan-profile {vlanProfile} host 1
wan 1 service internet host 1
exit
end
wr
`,
  "SANDYA": `interface gpon-olt_1/{slot}/{port}
onu {onu} type ALL sn {sn}
!
interface gpon-onu_1/{slot}/{port}:{onu}
  name {odp}_{pppoe}
  description {pppoe}
  tcont 1 name LLSANDYA profile {profile}
  gemport 1 name LLSANDYA  tcont 1
  gemport 1 traffic-limit upstream {profile} downstream {profile}
  service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
!
pon-onu-mng gpon-onu_1/{slot}/{port}:{onu}
  service LLSANDYA gemport 1 vlan {vlan}
  firewall enable level low anti-hack disable
  security-mgmt 1 state enable mode forward protocol web 
  wan 1 service internet host 1
!
end
wr
`,
  "MAZZNET": `interface gpon-olt_1/{slot}/{port}
onu {onu} type ALL sn {sn}
!
interface gpon-onu_1/{slot}/{port}:{onu}
name {odp}_{pppoe}
description {pppoe}
tcont 1 name LLMAZZNET profile {profile}
gemport 1 name LLMAZZNET tcont 1
gemport 1 traffic-limit upstream {profile} downstream {profile}
service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
!
pon-onu-mng gpon-onu_1/{slot}/{port}:{onu}
service LLMAZZNET gemport 1 vlan {vlan}
{locks}
wan-ip 1 mode pppoe username {pppoe} password 14045 vlan-profile 696-OPENPORTMAZZNET host 1
firewall enable level low anti-hack disable
security-mgmt 1 state enable mode forward protocol web 
wan 1 service internet host 1

!
end
wr
`
};

/**
 * Initial Terminal Shortcuts
 */
export const INITIAL_SHORTCUTS: Record<string, { body: string; category: string }> = {
  "onu uncfg": { body: "show gpon onu uncfg", category: "ZTE C320" },
  "onu kosong": { body: "terminal length 140\n\n\nshow gpon onu state gpon-olt_1/{slot}/{port}", category: "ZTE C320" },
  "conf t": { body: "conf t", category: "ZTE C320" },
  "end": { body: "end", category: "ZTE C320" },
  "dbm onu": { body: "show pon power onu-rx gpon-onu_1/{slot}/{port}:{onu}", category: "ZTE C320" },
  "dbm 1 port": { body: "terminal length 130\n\n\nshow pon power onu-rx gpon-olt_1/{slot}/{port}", category: "ZTE C320" },
  "exit & save": { body: "end\n\n\nwr", category: "ZTE C320" },
  "cur-con onu": { body: "show running-config interface gpon-onu_1/{slot}/{port}:{onu}\n\n\nshow onu running config gpon-onu_1/{slot}/{port}:{onu}", category: "ZTE C320" },
  "on-off eth": { body: "pon-onu-mng gpon-onu_1/{slot}/{port}:{onu}\n\n\n{locks}", category: "ZTE C320" },
  "ganti modem": { body: "interface gpon-onu_1/{slot}/{port}:{onu}\n\n\nregistration-method sn {sn}", category: "ZTE C320" },
  "cek onu by SN": { body: "show gpon onu by sn {sn}", category: "ZTE C320" },
  "status wan-ip": { body: "show gpon remote-onu wan-ip gpon-onu_1/{slot}/{port}:{onu}", category: "ZTE C320" },
  "detail-info": { body: "terminal length 130\n\n\nshow gpon onu detail-info gpon-onu_1/{slot}/{port}:{onu}", category: "ZTE C320" }
};
