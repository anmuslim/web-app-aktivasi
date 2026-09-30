

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { INITIAL_OLT_CONFIG, INITIAL_TEMPLATES } from './constants.ts';
import { ScriptData, OLTConfig, SubTabConfig, User, NavMenu } from './types.ts';

const getApiBase = () => {
  const savedOverride = localStorage.getItem('api_base_override');
  if (savedOverride) return savedOverride;
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return '';
};

const DEFAULT_PROFILES = [
  'INTERNET_10M',
  'INTERNET_20M',
  'INTERNET_30M',
  'INTERNET_50M',
  'INTERNET_100M',
  'INTERNET_150M',
  'INTERNET_200M'
];

const DEFAULT_USERS: User[] = [
  {
    id: '1',
    username: 'admin',
    name: 'Administrator',
    password: 'admin',
    role: 'admin',
    createdAt: '2026-09-30T00:00:00.000Z'
  }
];

type TerminalState = 'NORMAL' | 'PASSWORD' | 'NOECHO' | 'USERNAME';

const App: React.FC = () => {
  const [apiBase] = useState(getApiBase());
  const [oltConfigs, setOltConfigs] = useState<Record<string, OLTConfig>>(INITIAL_OLT_CONFIG || {});
  const [templates, setTemplates] = useState<Record<string, string>>(INITIAL_TEMPLATES || {});
  const [terminalShortcuts, setTerminalShortcuts] = useState<Record<string, { body: string; category: string } | string>>({});
  const [speedProfiles, setSpeedProfiles] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>(DEFAULT_USERS);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [isLoading, setIsLoading] = useState(true);

  // Authentication & Session
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('whusnet_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('whusnet_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('whusnet_theme', next);
  };

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
      document.body.style.backgroundColor = '#f8fafc';
      document.body.style.color = '#0f172a';
    } else {
      document.documentElement.classList.remove('light-mode');
      document.body.style.backgroundColor = '#020617';
      document.body.style.color = '#e2e8f0';
    }
  }, [theme]);

  // Terminal States
  const [isTelnetConnected, setIsTelnetConnected] = useState(false);
  const [isTelnetConnecting, setIsTelnetConnecting] = useState(false);
  const [terminalState, setTerminalState] = useState<TerminalState>('NORMAL');
  const [terminalFontSize, setTerminalFontSize] = useState(11); 
  
  const stateRef = useRef<TerminalState>('NORMAL');
  const wsRef = useRef<WebSocket | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const idleTimeoutRef = useRef<any>(null);

  // UI States
  const [activeNav, setActiveNav] = useState<NavMenu>('generator');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('whusnet_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('whusnet_sidebar_collapsed', String(next));
      return next;
    });
  };

  const [selectedOLT, setSelectedOLT] = useState<string>('');
  const [selectedSub, setSelectedSub] = useState<string>('');
  const [activeRightTab, setActiveRightTab] = useState<'script' | 'telnet'>('script');
  const [isOLTExpanded, setIsOLTExpanded] = useState(false);
  const [isAreaExpanded, setIsAreaExpanded] = useState(false);
  const [isShortcutsExpanded, setIsShortcutsExpanded] = useState(false);
  const [showPasteConfirm, setShowPasteConfirm] = useState(false);

  // Form States
  const [slot, setSlot] = useState('1');
  const [port, setPort] = useState('1');
  const [onu, setOnu] = useState('');
  const [sn, setSn] = useState('');
  const [odp, setOdp] = useState('');
  const [pppSuffix, setPppSuffix] = useState('');
  const [profile, setProfile] = useState('');
  const [locks, setLocks] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true });
  const [copySuccess, setCopySuccess] = useState(false);

  // Profile Search Dropdown States
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [profileSearchQuery, setProfileSearchQuery] = useState('');
  const [highlightedProfileIndex, setHighlightedProfileIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionsContainerRef = useRef<HTMLDivElement>(null);

  // Admin Form States
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeIP, setNewNodeIP] = useState('');
  const [newNodeUser, setNewNodeUser] = useState('');
  const [newNodePass, setNewNodePass] = useState('');
  const [targetNodeForSub, setTargetNodeForSub] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubVlan, setNewSubVlan] = useState('');
  const [newSubPrefix, setNewSubPrefix] = useState('');
  const [newSubProfile, setNewSubProfile] = useState('');
  const [newSubTemplate, setNewSubTemplate] = useState('');
  const [newTplName, setNewTplName] = useState('');
  const [newTplBody, setNewTplBody] = useState('');
  const [newShortcutName, setNewShortcutName] = useState('');
  const [newShortcutBody, setNewShortcutBody] = useState('');
  const [newShortcutCategory, setNewShortcutCategory] = useState('ZTE C320');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [activeShortcutCategoryTab, setActiveShortcutCategoryTab] = useState('ZTE C320');
  const [newProfileName, setNewProfileName] = useState('');
  const [editingProfileIndex, setEditingProfileIndex] = useState<number | null>(null);
  const [editingProfileValue, setEditingProfileValue] = useState('');

  // User Management Admin Form States
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'operator' | 'teknisi'>('operator');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserRole, setEditUserRole] = useState<'admin' | 'operator' | 'teknisi'>('operator');

  const templateAreaRef = useRef<HTMLTextAreaElement>(null);
  const shortcutAreaRef = useRef<HTMLTextAreaElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { stateRef.current = terminalState; }, [terminalState]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const shortcutCategories = useMemo(() => {
    const cats = new Set<string>();
    cats.add('ZTE C320');
    Object.values(terminalShortcuts).forEach((s: any) => {
      const cat = typeof s === 'object' && s !== null ? s.category : 'ZTE C320';
      if (cat && cat.trim()) {
        cats.add(cat.trim());
      }
    });
    return Array.from(cats);
  }, [terminalShortcuts]);

  useEffect(() => {
    if (!shortcutCategories.includes(activeShortcutCategoryTab)) {
      setActiveShortcutCategoryTab(shortcutCategories[0] || 'ZTE C320');
    }
  }, [shortcutCategories, activeShortcutCategoryTab]);

  const filteredProfiles = useMemo(() => {
    return speedProfiles.filter(p => 
      p.toLowerCase().includes(profileSearchQuery.toLowerCase())
    );
  }, [speedProfiles, profileSearchQuery]);

  useEffect(() => {
    setHighlightedProfileIndex(-1);
  }, [profileSearchQuery, isProfileDropdownOpen]);

  useEffect(() => {
    if (highlightedProfileIndex >= 0 && optionsContainerRef.current) {
      const activeEl = optionsContainerRef.current.querySelector(`[data-index="${highlightedProfileIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedProfileIndex]);

  const handleProfileKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isProfileDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsProfileDropdownOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedProfileIndex(prev => {
        if (filteredProfiles.length === 0) return -1;
        const next = prev + 1;
        return next >= filteredProfiles.length ? 0 : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedProfileIndex(prev => {
        if (filteredProfiles.length === 0) return -1;
        const next = prev - 1;
        return next < 0 ? filteredProfiles.length - 1 : next;
      });
    } else if (e.key === 'Enter') {
      if (highlightedProfileIndex >= 0 && highlightedProfileIndex < filteredProfiles.length) {
        e.preventDefault();
        const selected = filteredProfiles[highlightedProfileIndex];
        setProfile(selected);
        setIsProfileDropdownOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsProfileDropdownOpen(false);
    }
  };

  const resetIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    if (isTelnetConnected) {
      idleTimeoutRef.current = setTimeout(() => {
        if (xtermRef.current) {
          xtermRef.current.writeln("\r\n\x1b[33m[SESSION TIMEOUT: 5 MINUTES INACTIVITY]\x1b[0m");
        }
        disconnectTerminal();
      }, 300000); 
    }
  }, [isTelnetConnected]);

  useEffect(() => {
    return () => { if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current); };
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/data`);
      if (response.ok) {
        const data = await response.json();
        setOltConfigs(data.oltConfigs || {});
        setTemplates(data.templates || {});
        setTerminalShortcuts(data.terminalShortcuts || {});
        setSpeedProfiles(data.speedProfiles && data.speedProfiles.length > 0 ? data.speedProfiles : DEFAULT_PROFILES);
        if (Array.isArray(data.users) && data.users.length > 0) {
          setUsers(data.users);
        }
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
      }
    } catch (err) { setSyncStatus('error'); } finally { setIsLoading(false); }
  }, [apiBase]);

  useEffect(() => { loadData(); }, [loadData]);

  const saveToServer = useCallback(async (configs: any, tpls: any, shortcuts: any, profilesOpt?: string[], usersOpt?: User[]) => {
    setSyncStatus('syncing');
    try {
      const targetProfiles = profilesOpt !== undefined ? profilesOpt : speedProfiles;
      const targetUsers = usersOpt !== undefined ? usersOpt : users;
      const response = await fetch(`${apiBase}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oltConfigs: configs,
          templates: tpls,
          terminalShortcuts: shortcuts,
          speedProfiles: targetProfiles,
          users: targetUsers
        })
      });
      if (response.ok) setSyncStatus('synced'); else setSyncStatus('error');
    } catch (err) { setSyncStatus('error'); }
  }, [apiBase, speedProfiles, users]);

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const insertParam = (p: string, isShortcut = false) => {
    const textarea = isShortcut ? shortcutAreaRef.current : templateAreaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const currentVal = isShortcut ? newShortcutBody : newTplBody;
    const newVal = currentVal.substring(0, start) + `{${p}}` + currentVal.substring(textarea.selectionEnd);
    if (isShortcut) setNewShortcutBody(newVal); else setNewTplBody(newVal);
    setTimeout(() => {
        textarea.focus();
        const newPos = start + p.length + 2;
        textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const disconnectTerminal = useCallback(() => {
    if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsTelnetConnected(false);
    }
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (terminalContainerRef.current && !xtermRef.current) {
      const TerminalLib = (window as any).Terminal;
      if (!TerminalLib) return;
      const term = new TerminalLib({
        cursorBlink: true, 
        fontSize: terminalFontSize, 
        fontFamily: 'JetBrains Mono, monospace',
        theme: { background: '#050505', foreground: '#10b981', cursor: '#10b981' },
        convertEol: true, 
        rows: 45, // Fixed 45 rows
        cols: 100
      });
      term.open(terminalContainerRef.current);
      xtermRef.current = term;
      term.onData((data: string) => {
        resetIdleTimer();
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (data === '\r') { term.write('\r\n'); ws.send(JSON.stringify({ type: 'input', data: '\r' })); }
        else { if (stateRef.current === 'USERNAME') term.write(data); ws.send(JSON.stringify({ type: 'input', data })); }
      });
    }
  }, [terminalFontSize, resetIdleTimer]);

  useEffect(() => {
    if (xtermRef.current) {
        xtermRef.current.options.fontSize = terminalFontSize;
    }
  }, [terminalFontSize]);

  const addNode = () => {
    if (!newNodeName || !newNodeIP) return;
    const key = newNodeName.toUpperCase().replace(/\s+/g, '_');
    const updated = { ...oltConfigs, [key]: { code: `${newNodeName} - ${newNodeIP}`, username: newNodeUser, password: newNodePass, subtabs: {} } };
    setOltConfigs(updated); saveToServer(updated, templates, terminalShortcuts);
    setNewNodeName(''); setNewNodeIP(''); setNewNodeUser(''); setNewNodePass('');
  };

  const deleteNode = (k: string) => {
    if (confirm(`Hapus Node ${k}?`)) {
      const updated = { ...oltConfigs }; 
      delete updated[k];
      setOltConfigs(updated); saveToServer(updated, templates, terminalShortcuts);
    }
  };

  const addSubArea = () => {
    const target = targetNodeForSub || selectedOLT;
    if (!target || !newSubName || !newSubVlan || !newSubTemplate) return alert("Lengkapi data area!");
    const node = oltConfigs[target];
    if (!node) return;
    const updated = { ...oltConfigs, [target]: { ...node, subtabs: { ...(node.subtabs || {}), [newSubName]: { vlan: parseInt(newSubVlan), ppp_prefix: newSubPrefix, ip_olt: node.code.split(' - ')[1] || node.code, vlanProfile: newSubProfile, speedProfile: '', template: newSubTemplate } } } };
    setOltConfigs(updated); saveToServer(updated, templates, terminalShortcuts);
    setNewSubName(''); setNewSubVlan(''); setNewSubPrefix(''); setNewSubProfile('');
  };

  const deleteSubArea = (nodeKey: string, subKey: string) => {
    if (confirm(`Hapus Area ${subKey} di OLT ${nodeKey}?`)) {
        const updated = { ...oltConfigs };
        if (updated[nodeKey] && updated[nodeKey].subtabs) {
            delete updated[nodeKey].subtabs[subKey];
            setOltConfigs(updated); saveToServer(updated, templates, terminalShortcuts);
        }
    }
  };

  const addTemplate = () => {
    if (!newTplName || !newTplBody) return;
    const updated = { ...templates, [newTplName]: newTplBody };
    setTemplates(updated); saveToServer(oltConfigs, updated, terminalShortcuts);
    setNewTplName(''); setNewTplBody('');
  };

  const deleteTemplate = (name: string) => {
    if (confirm(`Hapus Template ${name}?`)) {
        const updated = { ...templates };
        delete updated[name];
        setTemplates(updated); saveToServer(oltConfigs, updated, terminalShortcuts);
    }
  };

  const addShortcut = () => {
    if (!newShortcutName || !newShortcutBody) return;
    const cat = newShortcutCategory.trim() || 'ZTE C320';
    const updated = { ...terminalShortcuts, [newShortcutName]: { body: newShortcutBody, category: cat } };
    setTerminalShortcuts(updated); saveToServer(oltConfigs, templates, updated);
    setNewShortcutName(''); setNewShortcutBody('');
  };

  const deleteShortcut = (name: string) => {
    if (confirm(`Hapus Shortcut ${name}?`)) {
        const updated = { ...terminalShortcuts };
        delete updated[name];
        setTerminalShortcuts(updated);
        saveToServer(oltConfigs, templates, updated);
    }
  };

  const addSpeedProfile = () => {
    if (!newProfileName || !newProfileName.trim()) return;
    const trimmed = newProfileName.trim();
    if (speedProfiles.includes(trimmed)) return alert("Profile sudah ada!");
    const updated = [...speedProfiles, trimmed];
    setSpeedProfiles(updated);
    saveToServer(oltConfigs, templates, terminalShortcuts, updated);
    setNewProfileName('');
  };

  const startEditProfile = (index: number) => {
    setEditingProfileIndex(index);
    setEditingProfileValue(speedProfiles[index]);
  };

  const saveEditProfile = () => {
    if (editingProfileIndex === null || !editingProfileValue.trim()) return;
    const trimmed = editingProfileValue.trim();
    const updated = [...speedProfiles];
    updated[editingProfileIndex] = trimmed;
    setSpeedProfiles(updated);
    saveToServer(oltConfigs, templates, terminalShortcuts, updated);
    setEditingProfileIndex(null);
    setEditingProfileValue('');
    if (profile === speedProfiles[editingProfileIndex]) {
      setProfile(trimmed);
    }
  };

  const cancelEditProfile = () => {
    setEditingProfileIndex(null);
    setEditingProfileValue('');
  };

  const deleteSpeedProfile = (index: number) => {
    const profileToDelete = speedProfiles[index];
    if (confirm(`Hapus Profile Speed "${profileToDelete}"?`)) {
      const updated = speedProfiles.filter((_, i) => i !== index);
      setSpeedProfiles(updated);
      saveToServer(oltConfigs, templates, terminalShortcuts, updated);
      if (profile === profileToDelete) {
        setProfile('');
      }
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError('');
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('Username dan password wajib diisi!');
      return;
    }
    setIsLoggingIn(true);
    try {
      const res = await fetch(`${apiBase}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setCurrentUser(data.user);
        localStorage.setItem('whusnet_auth_user', JSON.stringify(data.user));
        setLoginPassword('');
        setLoginError('');
      } else {
        setLoginError(data.message || 'Login gagal! Periksa username & password.');
      }
    } catch {
      // Fallback local verification
      const found = users.find(u => u.username.toLowerCase() === loginUsername.trim().toLowerCase() && u.password === loginPassword);
      if (found) {
        const uObj = { id: found.id, username: found.username, name: found.name, role: found.role };
        setCurrentUser(uObj);
        localStorage.setItem('whusnet_auth_user', JSON.stringify(uObj));
        setLoginPassword('');
        setLoginError('');
      } else {
        setLoginError('Username atau password salah!');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('whusnet_auth_user');
  };

  const addUser = () => {
    if (!newUserUsername.trim() || !newUserPassword) {
      alert("Username dan password user wajib diisi!");
      return;
    }
    const cleanUsername = newUserUsername.trim().toLowerCase();
    if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
      alert("Username sudah terdaftar!");
      return;
    }
    const newUser: User = {
      id: Date.now().toString(),
      username: cleanUsername,
      name: newUserName.trim() || cleanUsername,
      password: newUserPassword,
      role: newUserRole,
      createdAt: new Date().toISOString()
    };
    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    saveToServer(oltConfigs, templates, terminalShortcuts, speedProfiles, updatedUsers);
    setNewUserUsername('');
    setNewUserName('');
    setNewUserPassword('');
    setNewUserRole('operator');
  };

  const startEditUser = (user: User) => {
    setEditingUserId(user.id);
    setEditUserName(user.name);
    setEditUserPassword(user.password || '');
    setEditUserRole(user.role);
  };

  const cancelEditUser = () => {
    setEditingUserId(null);
    setEditUserName('');
    setEditUserPassword('');
  };

  const saveEditUser = (id: string) => {
    const updatedUsers = users.map(u => {
      if (u.id === id) {
        return {
          ...u,
          name: editUserName.trim() || u.username,
          password: editUserPassword.trim() ? editUserPassword : u.password,
          role: editUserRole
        };
      }
      return u;
    });
    setUsers(updatedUsers);
    saveToServer(oltConfigs, templates, terminalShortcuts, speedProfiles, updatedUsers);
    if (currentUser && currentUser.id === id) {
      const updatedSelf = { ...currentUser, name: editUserName.trim() || currentUser.username, role: editUserRole };
      setCurrentUser(updatedSelf);
      localStorage.setItem('whusnet_auth_user', JSON.stringify(updatedSelf));
    }
    setEditingUserId(null);
  };

  const deleteUser = (id: string) => {
    if (users.length <= 1) {
      alert("Tidak bisa menghapus user terakhir!");
      return;
    }
    const target = users.find(u => u.id === id);
    if (!target) return;
    if (currentUser && currentUser.id === id) {
      alert("Tidak bisa menghapus akun yang sedang Anda gunakan saat ini!");
      return;
    }
    if (confirm(`Hapus user "${target.username}" (${target.name})?`)) {
      const updatedUsers = users.filter(u => u.id !== id);
      setUsers(updatedUsers);
      saveToServer(oltConfigs, templates, terminalShortcuts, speedProfiles, updatedUsers);
    }
  };

  const clearTerminal = () => {
    if (xtermRef.current) xtermRef.current.reset();
  };

  const copyTerminalText = () => {
    if (xtermRef.current) {
        const selection = xtermRef.current.getSelection();
        if (selection) {
            navigator.clipboard.writeText(selection);
            alert("Teks terseleksi berhasil disalin!");
        } else {
            alert("Silakan blok/seleksi teks di terminal terlebih dahulu!");
        }
    }
  };

  const loginOLTAuto = () => {
    if (!isTelnetConnected || !wsRef.current || !selectedOLT || !oltConfigs[selectedOLT]) return alert("Pilih OLT & Connect!");
    const config = oltConfigs[selectedOLT];
    if (config.username) wsRef.current.send(JSON.stringify({ type: 'input', data: config.username + '\r' }));
    if (config.password) setTimeout(() => {
        wsRef.current?.send(JSON.stringify({ type: 'input', data: config.password + '\r' }));
    }, 600);
    resetIdleTimer();
  };

  const openWebOLT = () => {
    if (!currentOltIP) return alert("Pilih OLT dulu!");
    window.open(`http://${currentOltIP}`, '_blank');
  };

  const sendCommandToTerminal = (scriptRaw: string) => {
    if (!isTelnetConnected || !wsRef.current) return alert("Terminal offline!");
    const lockCommands = Object.entries(locks).map(([n, l]) => `interface eth eth_0/${n} state ${l ? 'lock' : 'unlock'}`).join('\n');
    const data: ScriptData = { slot, port, onu, sn, odp, profile, vlan: currentCfg?.vlan || 0, vlanProfile: currentCfg?.vlanProfile || '', pppoe: (currentCfg?.ppp_prefix || '') + pppSuffix, locks: lockCommands, vlanLines: '' };
    let processed = String(scriptRaw);
    Object.keys(data).forEach(k => { processed = processed.replace(new RegExp(`{${k}}`, 'g'), String((data as any)[k])); });
    
    if (xtermRef.current) {
      xtermRef.current.write(`\r\n\x1b[1;33m[SENDING COMMANDS...]\x1b[0m\r\n`);
    }

    processed.split('\n').forEach(line => { 
      if (line.trim().length > 0) {
        xtermRef.current?.write(`\x1b[1;36m>> ${line}\x1b[0m\r\n`);
        wsRef.current?.send(JSON.stringify({ type: 'input', data: line + '\r' })); 
      }
    });
    setShowPasteConfirm(false);
    resetIdleTimer();
  };

  const connectTerminal = () => {
    if (!currentOltIP) return alert("Pilih OLT!");
    setIsTelnetConnecting(true);
    const wsUrl = apiBase.replace(/^http/, 'ws');
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'connect', ip: currentOltIP, protocol: 'telnet', user: 'admin', password: '' }));
        setIsTelnetConnected(true); setIsTelnetConnecting(false); setTerminalState('NORMAL');
        resetIdleTimer();
      };
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.type === 'data' || d.type === 'status') xtermRef.current?.write(d.data || d.message);
        else if (d.type === 'state') setTerminalState(d.data as TerminalState);
        resetIdleTimer();
      };
      ws.onclose = () => { 
        setIsTelnetConnected(false); 
        setIsTelnetConnecting(false); 
        xtermRef.current?.writeln("\r\n\x1b[31m[OFFLINE / SESSION ENDED]\x1b[0m"); 
      };
    } catch (e) { setIsTelnetConnecting(false); }
  };

  const currentOltIP = useMemo(() => {
    if (!selectedOLT || !oltConfigs[selectedOLT]) return '';
    const parts = (oltConfigs[selectedOLT] as OLTConfig).code.split(' - ');
    return parts.length > 1 ? parts[1] : parts[0];
  }, [selectedOLT, oltConfigs]);

  const currentCfg = useMemo<SubTabConfig | null>(() => {
    if (!selectedOLT || !selectedSub || !oltConfigs[selectedOLT]) return null;
    const node = oltConfigs[selectedOLT] as OLTConfig;
    return node.subtabs?.[selectedSub] || null;
  }, [selectedOLT, selectedSub, oltConfigs]);

  const generatedScript = useMemo<string>(() => {
    if (isLoading || !selectedOLT || !selectedSub || !currentCfg || !templates[currentCfg.template]) return '-- Konfigurasi belum lengkap --';
    const lockCommands = Object.entries(locks).map(([n, l]) => `interface eth eth_0/${n} state ${l ? 'lock' : 'unlock'}`).join('\n');
    const data: ScriptData = { slot, port, onu, sn, odp, profile, vlan: currentCfg.vlan, vlanProfile: currentCfg.vlanProfile || '', pppoe: (currentCfg.ppp_prefix || '') + pppSuffix, locks: lockCommands, vlanLines: '' };
    let tpl = String(templates[currentCfg.template] || '');
    Object.keys(data).forEach(k => { tpl = tpl.replace(new RegExp(`{${k}}`, 'g'), String((data as any)[k])); });
    return tpl;
  }, [currentCfg, templates, slot, port, onu, sn, odp, pppSuffix, profile, locks, isLoading, selectedOLT, selectedSub]);

  const paramList = ['slot', 'port', 'onu', 'sn', 'odp', 'pppoe', 'profile', 'vlan', 'vlanProfile', 'locks'];

  const navItems: { id: NavMenu; label: string; icon: string; count?: number; desc: string }[] = useMemo(() => [
    { id: 'generator', label: 'Generator & Terminal', icon: '⚡', desc: 'Aktivasi OLT & CLI' },
    { id: 'olt', label: 'Manajemen OLT', icon: '🌐', count: Object.keys(oltConfigs).length, desc: 'Daftar IP & Akun OLT' },
    { id: 'area', label: 'Area & VLAN', icon: '🗺️', count: Object.values(oltConfigs).reduce((acc: number, o: any) => acc + Object.keys(o?.subtabs || {}).length, 0), desc: 'Sub-area & VLAN Profile' },
    { id: 'template', label: 'Template Script', icon: '📝', count: Object.keys(templates).length, desc: 'Script Designer GPON' },
    { id: 'shortcut', label: 'Shortcut Terminal', icon: '⌨️', count: Object.keys(terminalShortcuts).length, desc: 'Perintah CLI Cepat' },
    { id: 'speed', label: 'Profile / Speed', icon: '🚀', count: speedProfiles.length, desc: 'Bandwidth & Kecepatan' },
    { id: 'user', label: 'Manajemen User', icon: '👥', count: users.length, desc: 'Akses & Akun Petugas' },
  ], [oltConfigs, templates, terminalShortcuts, speedProfiles, users]);

  const currentNavTitle = useMemo(() => {
    switch (activeNav) {
      case 'generator': return { title: 'Generator Script & Terminal OLT', subtitle: 'Konfigurasi aktivasi ONU & terminal CLI interaktif' };
      case 'olt': return { title: 'Manajemen Node OLT', subtitle: 'Kelola data OLT, IP address, username & password koneksi' };
      case 'area': return { title: 'Manajemen Area & VLAN', subtitle: 'Kelola pemetaan area, VLAN ID, PPP Prefix dan Template OLT' };
      case 'template': return { title: 'Template Script Designer', subtitle: 'Rancang template script GPON dengan placeholder parameter otomatis' };
      case 'shortcut': return { title: 'Shortcut Perintah Terminal', subtitle: 'Koleksi perintah cepat CLI OLT dengan kategori & parameter dinamis' };
      case 'speed': return { title: 'Manajemen Profile / Speed', subtitle: 'Kelola daftar paket kecepatan internet untuk OLT' };
      case 'user': return { title: 'Manajemen User & Hak Akses', subtitle: 'Kelola akun petugas, kata sandi, dan role operasional' };
      default: return { title: 'Whusnet OLT Pro', subtitle: '' };
    }
  }, [activeNav]);

  // ----------------------------------------------------
  // GATED LOGIN SCREEN
  // ----------------------------------------------------
  if (!currentUser) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 relative transition-colors duration-200 ${
        theme === 'dark' ? 'bg-[#020617] text-slate-200' : 'bg-slate-100 text-slate-800'
      }`}>
        {/* Floating Theme Toggle in Corner */}
        <button
          onClick={toggleTheme}
          title={`Ganti tema (${theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'})`}
          className={`fixed top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 shadow-lg border ${
            theme === 'dark'
              ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-400 border-slate-700 backdrop-blur'
              : 'bg-white/95 hover:bg-slate-100 text-slate-800 border-slate-300 backdrop-blur shadow-slate-200'
          }`}
        >
          {theme === 'dark' ? (
            <>
              <span className="text-sm">☀️</span>
              <span className="text-[11px] font-mono tracking-wide uppercase">Terang</span>
            </>
          ) : (
            <>
              <span className="text-sm">🌙</span>
              <span className="text-[11px] font-mono tracking-wide uppercase">Gelap</span>
            </>
          )}
        </button>

        <div className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border shadow-2xl transition-all ${
          theme === 'dark'
            ? 'bg-slate-900/95 border-slate-800 shadow-cyan-950/20'
            : 'bg-white border-slate-200 shadow-xl'
        }`}>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 mb-3">
              <span className="font-mono font-black text-2xl">W</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent uppercase tracking-tight">
              Whusnet OLT Pro
            </h1>
            <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              Silakan login untuk mengakses konfigurasi & terminal OLT
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <span className="font-bold">⚠️</span>
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                Username
              </label>
              <input
                type="text"
                autoFocus
                placeholder="Masukkan username"
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
                className={`w-full p-3 rounded-xl text-xs outline-none border transition-all ${
                  theme === 'dark'
                    ? 'bg-slate-800 border-slate-700 text-white focus:border-cyan-500'
                    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                Password
              </label>
              <input
                type="password"
                placeholder="Masukkan password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className={`w-full p-3 rounded-xl text-xs outline-none border transition-all ${
                  theme === 'dark'
                    ? 'bg-slate-800 border-slate-700 text-white focus:border-cyan-500'
                    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white'
                }`}
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full mt-2 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-cyan-600/30 transition-all flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <span>Masuk ke Sistem</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800/40 text-center">
            <button
              type="button"
              onClick={() => { setLoginUsername('admin'); setLoginPassword('admin'); }}
              className={`text-[11px] underline underline-offset-4 transition-colors ${
                theme === 'dark' ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-800'
              }`}
            >
              🔑 Klik untuk isi Akun Bawaan: <span className="font-mono font-bold">admin / admin</span>
            </button>
            <div className="mt-3 text-[10px] text-slate-500 font-mono flex items-center justify-center gap-2">
              <span className={`w-2 h-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></span>
              <span>Server: {apiBase}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // MAIN APPLICATION DASHBOARD
  // ----------------------------------------------------
  return (
    <div className={`min-h-screen flex flex-col md:flex-row transition-colors duration-200 relative ${
      theme === 'dark' ? 'bg-[#020617] text-slate-200' : 'bg-slate-100 text-slate-800'
    }`}>
      {/* Floating Theme Button in Corner */}
      <button
        onClick={toggleTheme}
        title={`Ganti tema (${theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'})`}
        className={`fixed top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 shadow-lg border ${
          theme === 'dark'
            ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-400 border-slate-700 backdrop-blur'
            : 'bg-white/95 hover:bg-slate-100 text-slate-800 border-slate-300 backdrop-blur shadow-slate-200'
        }`}
      >
        {theme === 'dark' ? (
          <>
            <span className="text-sm">☀️</span>
            <span className="text-[11px] font-mono tracking-wide uppercase">Terang</span>
          </>
        ) : (
          <>
            <span className="text-sm">🌙</span>
            <span className="text-[11px] font-mono tracking-wide uppercase">Gelap</span>
          </>
        )}
      </button>

      {/* Mobile Backdrop */}
      {isMobileNavOpen && (
        <div
          onClick={() => setIsMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* LEFT SIDEBAR NAVBAR */}
      <aside className={`fixed inset-y-0 left-0 z-40 border-r flex flex-col transition-all duration-300 transform ${
        isMobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } ${
        isSidebarCollapsed ? 'w-64 md:w-20' : 'w-64 md:w-72'
      } ${
        theme === 'dark'
          ? 'bg-slate-950 border-slate-800/80 text-slate-200'
          : 'bg-white border-slate-200 text-slate-800 shadow-lg'
      }`}>
        {/* Brand / Logo */}
        <div className={`p-4 border-b flex items-center transition-all ${
          isSidebarCollapsed ? 'justify-between md:justify-center md:flex-col md:gap-3' : 'justify-between'
        } ${theme === 'dark' ? 'border-slate-800/60' : 'border-slate-200'}`}>
          <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'md:justify-center' : ''}`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-mono font-black text-xl shadow-lg shadow-cyan-500/20 shrink-0">
              W
            </div>
            {!isSidebarCollapsed && (
              <div className="overflow-hidden">
                <h1 className="text-base font-black tracking-tight uppercase bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent truncate">
                  Whusnet OLT Pro
                </h1>
                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></span>
                  <span className="truncate max-w-[130px]">{apiBase.replace(/^https?:\/\//, '')}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop Minimize / Expand Toggle Button inside sidebar */}
            <button
              onClick={toggleSidebarCollapse}
              className={`hidden md:flex p-1.5 rounded-lg border transition-all ${
                theme === 'dark'
                  ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/60'
                  : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title={isSidebarCollapsed ? "Perluas Sidebar" : "Minimize Sidebar"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-200 ${isSidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>

            {/* Close button on mobile */}
            <button
              onClick={() => setIsMobileNavOpen(false)}
              className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-4 custom-scrollbar">
          <div>
            {!isSidebarCollapsed ? (
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">
                Menu Utama
              </div>
            ) : (
              <div className="my-1 border-t border-slate-800/40" />
            )}
            <button
              onClick={() => { setActiveNav('generator'); setIsMobileNavOpen(false); }}
              title="Generator Script & Terminal CLI"
              className={`w-full flex items-center rounded-xl transition-all ${
                isSidebarCollapsed ? 'justify-center p-3' : 'justify-between p-2.5 text-left'
              } ${
                activeNav === 'generator'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold shadow-lg shadow-cyan-600/20'
                  : theme === 'dark'
                  ? 'hover:bg-slate-900 text-slate-300 hover:text-white'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                <span className="text-xl">⚡</span>
                {!isSidebarCollapsed && (
                  <div>
                    <div className="text-xs font-bold leading-none">Generator & Terminal</div>
                    <div className={`text-[10px] mt-1 ${activeNav === 'generator' ? 'text-cyan-100' : 'text-slate-500'}`}>
                      Aktivasi OLT & CLI
                    </div>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && selectedOLT && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                  activeNav === 'generator' ? 'bg-white/20 text-white' : 'bg-cyan-500/10 text-cyan-400'
                }`}>
                  AKTIF
                </span>
              )}
            </button>
          </div>

          <div>
            {!isSidebarCollapsed ? (
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">
                Pengaturan Sistem
              </div>
            ) : (
              <div className="my-1 border-t border-slate-800/40" />
            )}
            <div className="space-y-1">
              {navItems.filter(item => item.id !== 'generator').map(item => {
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveNav(item.id); setIsMobileNavOpen(false); }}
                    title={`${item.label} (${item.desc})`}
                    className={`w-full flex items-center rounded-xl transition-all relative ${
                      isSidebarCollapsed ? 'justify-center p-3' : 'justify-between p-2.5 text-left'
                    } ${
                      isActive
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold shadow-lg shadow-cyan-600/20'
                        : theme === 'dark'
                        ? 'hover:bg-slate-900 text-slate-300 hover:text-white'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                      <span className="text-xl">{item.icon}</span>
                      {!isSidebarCollapsed && (
                        <div>
                          <div className="text-xs font-bold leading-none">{item.label}</div>
                          <div className={`text-[10px] mt-1 ${isActive ? 'text-cyan-100' : 'text-slate-500'}`}>
                            {item.desc}
                          </div>
                        </div>
                      )}
                    </div>
                    {item.count !== undefined && (
                      !isSidebarCollapsed ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {item.count}
                        </span>
                      ) : (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400" />
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Footer: User profile & Logout */}
        <div className={`p-3 border-t ${theme === 'dark' ? 'border-slate-800/60' : 'border-slate-200'}`}>
          {!isSidebarCollapsed ? (
            <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs uppercase shrink-0">
                  {(currentUser?.name || currentUser?.username || 'U')[0]}
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold truncate">{currentUser?.name || currentUser?.username}</div>
                  <div className="text-[10px] text-cyan-400 uppercase font-mono font-semibold">{currentUser?.role}</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Keluar dari akun"
                className="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 text-xs font-bold transition-all"
              >
                Keluar
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <div
                className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-sm uppercase shrink-0"
                title={`${currentUser?.name || currentUser?.username} (${currentUser?.role})`}
              >
                {(currentUser?.name || currentUser?.username || 'U')[0]}
              </div>
              <button
                onClick={handleLogout}
                title="Keluar dari akun"
                className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-600 transition-all text-sm"
              >
                🚪
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className={`flex-1 min-h-screen flex flex-col w-full min-w-0 transition-all duration-300 ${
        isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'
      }`}>
        {/* Top Header Bar */}
        <header className={`p-4 md:px-8 py-3.5 border-b flex items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur-md transition-colors ${
          theme === 'dark' ? 'bg-[#020617]/90 border-slate-800' : 'bg-slate-100/90 border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setIsMobileNavOpen(true)}
              className="md:hidden p-2 rounded-xl border bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800"
              title="Buka Menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Desktop Sidebar Minimize / Expand Toggle Button in Header */}
            <button
              onClick={toggleSidebarCollapse}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                theme === 'dark'
                  ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm'
              }`}
              title={isSidebarCollapsed ? "Perluas Sidebar" : "Minimize Sidebar"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-200 ${isSidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
              <span className="text-[11px] font-mono tracking-wide uppercase">
                {isSidebarCollapsed ? 'Expand' : 'Minimize'}
              </span>
            </button>

            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight uppercase flex items-center gap-2">
                <span>{currentNavTitle.title}</span>
              </h2>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {currentNavTitle.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pr-24">
            {/* Quick action button to go back to generator if on settings view */}
            {activeNav !== 'generator' && (
              <button
                onClick={() => setActiveNav('generator')}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <span>⚡</span>
                <span className="hidden sm:inline">Generator Script</span>
              </button>
            )}
          </div>
        </header>

        {/* Content Container */}
        <div className="p-4 md:p-6 lg:p-8 flex-1">
          {isLoading && (
            <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-4">
               <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Memuat Data...</p>
            </div>
          )}
          {/* 1. GENERATOR & LIVE TERMINAL VIEW */}
          {activeNav === 'generator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto">
              {/* Left Column: Configuration & Parameters */}
              <div className="lg:col-span-5 space-y-6 overflow-y-auto lg:custom-scrollbar pr-0 lg:pr-2">
                {/* Node OLT Selector */}
                <section className={`rounded-2xl p-4 md:p-6 shadow-xl relative border transition-colors ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
                }`}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                      Pilih Node OLT
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveNav('olt')}
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border transition-all ${
                          theme === 'dark' ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20' : 'text-cyan-600 bg-cyan-50 border-cyan-200 hover:bg-cyan-100'
                        }`}
                        title="Buka Manajemen OLT"
                      >
                        + Kelola
                      </button>
                      {Object.keys(oltConfigs).length > 5 && (
                        <button onClick={() => setIsOLTExpanded(!isOLTExpanded)} className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border transition-all ${
                          theme === 'dark' ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' : 'text-cyan-600 bg-cyan-50 border-cyan-200'
                        }`}>
                          {isOLTExpanded ? 'Show Less' : 'View All'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={`flex flex-wrap gap-2 overflow-hidden transition-all duration-500 ease-in-out ${isOLTExpanded ? 'max-h-[1000px]' : 'max-h-[44px]'}`}>
                    {Object.keys(oltConfigs).length === 0 ? (
                      <div className="flex items-center justify-between w-full py-2">
                        <span className="text-[11px] text-slate-500 italic">Data OLT Kosong.</span>
                        <button onClick={() => setActiveNav('olt')} className="text-xs text-cyan-500 font-bold hover:underline">Tambah OLT</button>
                      </div>
                    ) : (
                      Object.keys(oltConfigs).map(k => (
                        <button
                          key={k}
                          onClick={() => { setSelectedOLT(k); setSelectedSub(''); }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                            selectedOLT === k
                              ? 'bg-cyan-500 text-slate-900 border-cyan-400 shadow-lg shadow-cyan-500/20'
                              : theme === 'dark'
                              ? 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-white'
                          }`}
                        >
                          {k}
                        </button>
                      ))
                    )}
                  </div>

                  {selectedOLT && oltConfigs[selectedOLT] && (
                    <div className={`pt-6 mt-6 border-t animate-in slide-in-from-top-2 duration-300 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                          Pilih Area & VLAN
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setTargetNodeForSub(selectedOLT); setActiveNav('area'); }}
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border transition-all ${
                              theme === 'dark' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20' : 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100'
                            }`}
                            title="Buka Manajemen Area"
                          >
                            + Area
                          </button>
                          {Object.keys((oltConfigs[selectedOLT] as OLTConfig).subtabs || {}).length > 8 && (
                            <button onClick={() => setIsAreaExpanded(!isAreaExpanded)} className="text-[10px] font-bold text-blue-500 uppercase bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 hover:bg-blue-500/20 transition-all">
                              {isAreaExpanded ? 'Show Less' : 'View All'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={`flex flex-wrap gap-2 overflow-hidden transition-all duration-500 ease-in-out ${isAreaExpanded ? 'max-h-[1000px]' : 'max-h-[44px]'}`}>
                        {Object.keys((oltConfigs[selectedOLT] as OLTConfig).subtabs || {}).length === 0 ? (
                          <div className="flex items-center justify-between w-full py-1">
                            <span className="text-[11px] text-slate-500 italic">Belum ada Area/VLAN untuk OLT ini.</span>
                            <button onClick={() => { setTargetNodeForSub(selectedOLT); setActiveNav('area'); }} className="text-xs text-blue-500 font-bold hover:underline">Tambah Area</button>
                          </div>
                        ) : (
                          Object.keys((oltConfigs[selectedOLT] as OLTConfig).subtabs || {}).map(s => (
                            <button
                              key={s}
                              onClick={() => setSelectedSub(s)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                                selectedSub === s
                                  ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                                  : theme === 'dark'
                                  ? 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-white'
                              }`}
                            >
                              {s}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </section>

                {/* Form Parameters */}
                <section className={`rounded-2xl p-4 md:p-6 space-y-4 shadow-xl border transition-colors ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
                }`}>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`border rounded p-2 flex flex-col ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[8px] text-slate-500 uppercase font-bold">Target IP</span>
                      <span className="text-[11px] font-mono text-cyan-500 font-bold">{currentOltIP || '0.0.0.0'}</span>
                    </div>
                    <div className={`border rounded p-2 flex flex-col ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[8px] text-slate-500 uppercase font-bold">VLAN ID</span>
                      <span className="text-[11px] font-mono text-blue-500 font-bold">{currentCfg?.vlan || '----'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-bold uppercase">Slot</label>
                      <input
                        value={slot}
                        onChange={e => setSlot(e.target.value)}
                        className={`w-full rounded p-2 text-sm outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-bold uppercase">Port</label>
                      <input
                        value={port}
                        onChange={e => setPort(e.target.value)}
                        className={`w-full rounded p-2 text-sm outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-bold uppercase">ONU ID</label>
                      <input
                        value={onu}
                        onChange={e => setOnu(e.target.value)}
                        className={`w-full rounded p-2 text-sm outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Serial Number (SN)</label>
                    <input
                      value={sn}
                      onChange={e => setSn(e.target.value)}
                      className={`w-full rounded p-2 text-sm font-mono outline-none uppercase border transition-colors ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                      }`}
                      placeholder="ZTEGC..."
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">ODP / Label</label>
                    <input
                      value={odp}
                      onChange={e => setOdp(e.target.value)}
                      className={`w-full rounded p-2 text-sm outline-none border transition-colors ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                      }`}
                      placeholder="ODP-..."
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">PPPoE User</label>
                    <div className="flex gap-2">
                      <div className={`border rounded px-2.5 py-2 text-[11px] font-mono flex items-center min-w-[65px] ${
                        theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-600'
                      }`}>
                        {currentCfg?.ppp_prefix || '...'}
                      </div>
                      <input
                        value={pppSuffix}
                        onChange={e => setPppSuffix(e.target.value)}
                        className={`flex-1 rounded p-2 text-sm outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                        }`}
                        placeholder="username"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 relative" ref={dropdownRef}>
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-slate-500 font-bold uppercase">Profile / Speed</label>
                      <button
                        onClick={() => setActiveNav('speed')}
                        className="text-[9px] text-cyan-500 hover:underline uppercase font-bold"
                      >
                        + Edit Profile
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        value={profile}
                        onChange={e => {
                          setProfile(e.target.value);
                          setProfileSearchQuery(e.target.value);
                          setIsProfileDropdownOpen(true);
                        }}
                        onFocus={() => {
                          setProfileSearchQuery(profile);
                          setIsProfileDropdownOpen(true);
                        }}
                        onKeyDown={handleProfileKeyDown}
                        className={`w-full rounded p-2 pr-8 text-sm outline-none font-medium border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                        }`}
                        placeholder="Cari atau ketik Profile..."
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setProfileSearchQuery('');
                          setIsProfileDropdownOpen(!isProfileDropdownOpen);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-200 ${isProfileDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {isProfileDropdownOpen && (
                      <div ref={optionsContainerRef} className={`absolute z-50 w-full mt-1 border rounded-lg shadow-2xl max-h-48 overflow-y-auto custom-scrollbar ${
                        theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                      }`}>
                        <div className={`p-2 border-b sticky top-0 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                          <input
                            type="text"
                            placeholder="Ketik untuk mencari..."
                            value={profileSearchQuery}
                            onChange={e => setProfileSearchQuery(e.target.value)}
                            onKeyDown={handleProfileKeyDown}
                            className={`w-full rounded p-1.5 text-xs outline-none border ${
                              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <div className="py-1">
                          {(() => {
                            if (filteredProfiles.length === 0) {
                              return (
                                <div className="px-3 py-2 text-xs text-slate-500 italic">
                                  Tidak ada profile cocok. Coba simpan di menu Profile / Speed.
                                </div>
                              );
                            }
                            return filteredProfiles.map((p, idx) => (
                              <button
                                key={p}
                                type="button"
                                data-index={idx}
                                onClick={() => {
                                  setProfile(p);
                                  setIsProfileDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors font-mono ${
                                  highlightedProfileIndex === idx
                                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                                    : profile === p
                                    ? 'bg-cyan-500/20 text-cyan-400 font-medium'
                                    : theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {p}
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={`space-y-1 pt-2 border-t ${theme === 'dark' ? 'border-slate-800/80' : 'border-slate-200'}`}>
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Eth Port Lock (ONU)</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => setLocks(prev => ({ ...prev, [n]: !prev[n] }))}
                          className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                            locks[n]
                              ? 'bg-rose-500/20 border-rose-500 text-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                              : 'bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                          }`}
                        >
                          {locks[n] ? `Eth${n} LOCK` : `Eth${n} OPEN`}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </div>

              {/* Right Column: Script Preview & Live Terminal */}
              <div className="lg:col-span-7 flex flex-col h-[750px] lg:h-[820px] overflow-hidden">
                <section className={`border rounded-3xl flex flex-col h-full overflow-hidden shadow-2xl relative transition-colors ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                }`}>
                  <div className={`flex border-b shrink-0 ${theme === 'dark' ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-100/70 border-slate-200'}`}>
                    <button
                      onClick={() => setActiveRightTab('script')}
                      className={`flex-1 py-3.5 text-xs font-bold uppercase transition-all ${
                        activeRightTab === 'script'
                          ? 'text-cyan-500 border-b-2 border-cyan-500 bg-cyan-500/10'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Script Preview
                    </button>
                    <button
                      onClick={() => setActiveRightTab('telnet')}
                      className={`flex-1 py-3.5 text-xs font-bold uppercase transition-all ${
                        activeRightTab === 'telnet'
                          ? 'text-emerald-500 border-b-2 border-emerald-500 bg-emerald-500/10'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Live Terminal
                    </button>
                  </div>

                  {/* SCRIPT PREVIEW PANEL */}
                  <div className={`flex-1 flex flex-col p-4 md:p-6 overflow-hidden ${activeRightTab !== 'script' ? 'hidden' : ''} ${
                    theme === 'dark' ? 'bg-[#0a0f1e]' : 'bg-slate-50'
                  }`}>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider">
                        Script Output GPON
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={openWebOLT}
                          className={`px-4 py-2 border rounded-xl text-[10px] font-bold transition-all uppercase ${
                            theme === 'dark'
                              ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Web OLT
                        </button>
                        <button
                          onClick={() => copyToClipboard(generatedScript)}
                          className={`px-4 md:px-6 py-2 rounded-xl text-[10px] font-bold text-white transition-all ${
                            copySuccess ? 'bg-emerald-600 shadow-lg shadow-emerald-500/30' : 'bg-cyan-600 shadow-lg shadow-cyan-500/30'
                          }`}
                        >
                          {copySuccess ? 'BERHASIL DISALIN!' : 'SALIN SCRIPT'}
                        </button>
                      </div>
                    </div>
                    <pre className={`flex-1 overflow-auto text-[13px] font-mono p-4 rounded-xl border whitespace-pre-wrap custom-scrollbar ${
                      theme === 'dark' ? 'bg-slate-950/80 text-cyan-200/90 border-slate-800' : 'bg-slate-900 text-cyan-300 border-slate-300'
                    }`}>
                      {generatedScript}
                    </pre>
                  </div>

                  {/* LIVE TERMINAL PANEL */}
                  <div className={`flex-1 flex flex-col bg-[#050505] overflow-hidden relative ${activeRightTab !== 'telnet' ? 'hidden' : ''}`}>
                    <div className="p-3 border-b border-emerald-900/20 bg-[#080c14] z-10 shrink-0 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={`shrink-0 w-2.5 h-2.5 rounded-full ${isTelnetConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></div>
                        <span className="text-[11px] font-bold text-emerald-400 uppercase truncate">
                          {isTelnetConnected ? `OLT: ${selectedOLT || currentOltIP}` : isTelnetConnecting ? 'CONNECTING...' : 'OFFLINE'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="hidden md:flex items-center gap-2">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Size: {terminalFontSize}</span>
                          <input
                            type="range"
                            min="8"
                            max="20"
                            value={terminalFontSize}
                            onChange={(e) => setTerminalFontSize(parseInt(e.target.value))}
                            className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>

                        <div className="flex gap-1.5">
                          <button
                            onClick={loginOLTAuto}
                            disabled={!isTelnetConnected}
                            title="Auto Login OLT"
                            className="px-2.5 py-1 bg-slate-800 border border-slate-700 text-amber-400 rounded text-[9px] font-bold uppercase hover:bg-slate-700 disabled:opacity-30"
                          >
                            Login
                          </button>

                          {!isTelnetConnected ? (
                            <button
                              onClick={connectTerminal}
                              disabled={isTelnetConnecting}
                              className="px-3.5 py-1 bg-emerald-600 text-white rounded text-[9px] font-bold uppercase disabled:opacity-50 hover:bg-emerald-500 transition-all shadow-md shadow-emerald-600/30"
                            >
                              Connect
                            </button>
                          ) : (
                            <div className="flex gap-1.5">
                              <button
                                onClick={disconnectTerminal}
                                className="px-3 py-1 bg-rose-600 text-white rounded text-[9px] font-bold uppercase hover:bg-rose-500 transition-all"
                              >
                                DISCONNECT
                              </button>
                              <button
                                onClick={() => setShowPasteConfirm(true)}
                                className="px-3 py-1 bg-cyan-600 text-white rounded text-[9px] font-bold uppercase hover:bg-cyan-500 transition-all shadow-md shadow-cyan-600/30"
                              >
                                PASTE SCRIPT
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Scrollable area grouping terminal lines and shortcuts bar together */}
                    <div className="flex-1 overflow-auto custom-scrollbar bg-black relative flex flex-col justify-between">
                      {/* The terminal wrapper */}
                      <div ref={terminalContainerRef} className="w-full shrink-0 flex-1" />

                      {/* QUICK COMMANDS UNDER TERMINAL */}
                      <div className="bg-[#0b101a] border-t border-slate-800/80 shrink-0 flex flex-col z-10 sticky bottom-0">
                        <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-[#0b101a] border-b border-slate-800/50 gap-2">
                          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none max-w-full">
                            {shortcutCategories.map(cat => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setActiveShortcutCategoryTab(cat)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all whitespace-nowrap ${
                                  activeShortcutCategoryTab === cat
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
                                    : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-800/50'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setActiveNav('shortcut')}
                              className="text-[8px] text-cyan-400 hover:underline uppercase font-bold"
                            >
                              + Edit Shortcut
                            </button>
                            {Object.keys(terminalShortcuts).length > 6 && (
                              <button
                                onClick={() => setIsShortcutsExpanded(!isShortcutsExpanded)}
                                className="text-[8px] font-bold text-emerald-400 uppercase px-2 hover:bg-emerald-500/10 rounded transition-all"
                              >
                                {isShortcutsExpanded ? 'Show Less' : 'View All'}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className={`overflow-y-auto p-2.5 custom-scrollbar flex flex-wrap gap-1.5 content-start transition-all duration-150 bg-[#080d16] ${isShortcutsExpanded ? 'h-48' : 'h-16'}`}>
                          {(() => {
                            const filtered = Object.entries(terminalShortcuts).filter(([_, s]) => {
                              const cat = typeof s === 'object' && s !== null ? (s as any).category : 'ZTE C320';
                              return cat === activeShortcutCategoryTab;
                            });

                            if (filtered.length === 0) {
                              return <span className="text-[11px] text-slate-500 italic px-2 py-1">Belum ada perintah dalam kategori ini.</span>;
                            }

                            return filtered.map(([name, s]) => {
                              const script = typeof s === 'object' && s !== null ? (s as any).body : s;
                              return (
                                <button
                                  key={name}
                                  onClick={() => isTelnetConnected && sendCommandToTerminal(script)}
                                  disabled={!isTelnetConnected}
                                  className={`px-2 py-1 bg-slate-800/70 border border-slate-700/60 rounded-md text-[11px] font-sans font-bold uppercase transition-all ${
                                    isTelnetConnected
                                      ? 'text-slate-200 hover:text-emerald-400 hover:border-emerald-500 hover:bg-slate-800'
                                      : 'text-slate-600 opacity-40 cursor-not-allowed'
                                  }`}
                                >
                                  {name}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* 2. MANAJEMEN OLT VIEW */}
          {activeNav === 'olt' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
              {/* Form Tambah OLT */}
              <div className="lg:col-span-5">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                      <span>🌐</span> Tambah Node OLT Baru
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nama OLT</label>
                      <input
                        placeholder="e.g. OLT-PUSAT-01"
                        value={newNodeName}
                        onChange={e => setNewNodeName(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">IP Address</label>
                      <input
                        placeholder="e.g. 192.168.10.1"
                        value={newNodeIP}
                        onChange={e => setNewNodeIP(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs font-mono outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">CLI Username</label>
                        <input
                          placeholder="admin"
                          value={newNodeUser}
                          onChange={e => setNewNodeUser(e.target.value)}
                          className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">CLI Password</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={newNodePass}
                          onChange={e => setNewNodePass(e.target.value)}
                          className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    </div>
                    <button
                      onClick={addNode}
                      className="w-full mt-2 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-cyan-600/20 transition-all"
                    >
                      Simpan Node OLT
                    </button>
                  </div>
                </div>
              </div>

              {/* Daftar OLT */}
              <div className="lg:col-span-7">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Daftar Node OLT Terdaftar ({Object.keys(oltConfigs).length})
                    </h3>
                  </div>

                  <div className="space-y-2.5 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                    {Object.keys(oltConfigs).length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-4">Belum ada OLT terdaftar. Silakan tambahkan pada form di samping.</p>
                    ) : (
                      (Object.entries(oltConfigs) as [string, OLTConfig][]).map(([k, cfg]) => {
                        const isSelected = selectedOLT === k;
                        const subCount = Object.keys(cfg.subtabs || {}).length;
                        return (
                          <div
                            key={k}
                            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                              isSelected
                                ? 'border-cyan-500/60 bg-cyan-500/10'
                                : theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-cyan-400">{k}</span>
                                {isSelected && (
                                  <span className="text-[9px] px-2 py-0.5 rounded bg-cyan-500 text-slate-950 font-bold uppercase">
                                    Sedang Dipilih
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-3">
                                <span>Code/IP: <strong className="text-slate-200">{cfg.code}</strong></span>
                                <span>User: <strong className="text-slate-200">{cfg.username || '-'}</strong></span>
                                <span>Area: <strong className="text-cyan-400">{subCount} area</strong></span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => { setSelectedOLT(k); setSelectedSub(''); setActiveNav('generator'); }}
                                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase"
                              >
                                Pilih di Generator
                              </button>
                              <button
                                onClick={() => deleteNode(k)}
                                className="px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white border border-rose-500/30 font-bold text-xs uppercase transition-all"
                              >
                                Hapus
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. MANAJEMEN AREA & VLAN VIEW */}
          {activeNav === 'area' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
              {/* Form Tambah Area */}
              <div className="lg:col-span-5">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                      <span>🗺️</span> Tambah Area & Sub-Tab Baru
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Target Node OLT</label>
                      <select
                        value={targetNodeForSub}
                        onChange={e => setTargetNodeForSub(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="">-- Pilih Node OLT --</option>
                        {Object.keys(oltConfigs).map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nama Area / Sub-Tab</label>
                      <input
                        placeholder="e.g. AREA-CLUSTER-01"
                        value={newSubName}
                        onChange={e => setNewSubName(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">VLAN ID</label>
                        <input
                          type="number"
                          placeholder="e.g. 100"
                          value={newSubVlan}
                          onChange={e => setNewSubVlan(e.target.value)}
                          className={`w-full p-2.5 rounded-xl text-xs font-mono outline-none border transition-colors ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">VLAN Profile</label>
                        <input
                          placeholder="e.g. UP-100"
                          value={newSubProfile}
                          onChange={e => setNewSubProfile(e.target.value)}
                          className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">PPP Prefix</label>
                        <input
                          placeholder="e.g. whus-"
                          value={newSubPrefix}
                          onChange={e => setNewSubPrefix(e.target.value)}
                          className={`w-full p-2.5 rounded-xl text-xs font-mono outline-none border transition-colors ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Template Script</label>
                        <select
                          value={newSubTemplate}
                          onChange={e => setNewSubTemplate(e.target.value)}
                          className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        >
                          <option value="">Pilih Template...</option>
                          {Object.keys(templates).map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={addSubArea}
                      className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-blue-600/20 transition-all"
                    >
                      Simpan Area & VLAN
                    </button>
                  </div>
                </div>
              </div>

              {/* Daftar Area */}
              <div className="lg:col-span-7">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Daftar Pemetaan Area & VLAN
                    </h3>
                  </div>

                  <div className="space-y-2.5 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                    {(() => {
                      const allSubs = (Object.entries(oltConfigs) as [string, OLTConfig][]).flatMap(([nodeKey, cfg]) =>
                        Object.entries(cfg.subtabs || {}).map(([subKey, subCfg]) => ({
                          nodeKey,
                          subKey,
                          subCfg
                        }))
                      );

                      if (allSubs.length === 0) {
                        return <p className="text-xs text-slate-500 italic py-4">Belum ada Area/VLAN terdaftar.</p>;
                      }

                      return allSubs.map(({ nodeKey, subKey, subCfg }) => (
                        <div
                          key={`${nodeKey}-${subKey}`}
                          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-blue-400">{subKey}</span>
                              <span className="text-[10px] text-slate-400 font-mono">({nodeKey})</span>
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-3">
                              <span>VLAN ID: <strong className="text-blue-300 font-bold">{subCfg.vlan}</strong></span>
                              <span>Prefix: <strong className="text-slate-200">{subCfg.ppp_prefix || '-'}</strong></span>
                              <span>Template: <strong className="text-purple-400">{subCfg.template}</strong></span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => { setSelectedOLT(nodeKey); setSelectedSub(subKey); setActiveNav('generator'); }}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase"
                            >
                              Pilih di Generator
                            </button>
                            <button
                              onClick={() => deleteSubArea(nodeKey, subKey)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white border border-rose-500/30 font-bold text-xs uppercase transition-all"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. TEMPLATE SCRIPT DESIGNER VIEW */}
          {activeNav === 'template' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
              {/* Form Tambah Template */}
              <div className="lg:col-span-6">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                      <span>📝</span> Script Designer GPON
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nama Template</label>
                      <input
                        placeholder="e.g. ZTE_F670L_STANDARD"
                        value={newTplName}
                        onChange={e => setNewTplName(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                        Placeholder Parameter Otomatis (Klik untuk menyisipkan)
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {paramList.map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => insertParam(p)}
                            className="px-2 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 rounded-md text-[10px] font-mono font-bold transition-all"
                          >
                            +{`{${p}}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Isi Template Script</label>
                      <textarea
                        ref={templateAreaRef}
                        rows={12}
                        placeholder="interface gpon-olt_1/{slot}/{port}&#10;onu {onu} type ZTE-F670L sn {sn}&#10;..."
                        value={newTplBody}
                        onChange={e => setNewTplBody(e.target.value)}
                        className={`w-full p-3 rounded-xl text-xs font-mono outline-none border transition-colors custom-scrollbar ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <button
                      onClick={addTemplate}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-purple-600/20 transition-all"
                    >
                      Simpan Template Script
                    </button>
                  </div>
                </div>
              </div>

              {/* Daftar Template */}
              <div className="lg:col-span-6">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Daftar Template Script ({Object.keys(templates).length})
                    </h3>
                  </div>

                  <div className="space-y-3 max-h-[620px] overflow-y-auto custom-scrollbar pr-1">
                    {Object.entries(templates).map(([k, tpl]) => (
                      <div
                        key={k}
                        className={`p-4 rounded-xl border space-y-2 ${
                          theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-purple-400 text-xs">{k}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setNewTplName(k); setNewTplBody(tpl); }}
                              className="text-xs text-cyan-400 hover:underline font-bold"
                            >
                              Muat ke Editor
                            </button>
                            <button
                              onClick={() => deleteTemplate(k)}
                              className="text-xs text-rose-500 hover:underline font-bold"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                        <pre className="text-[10px] font-mono text-slate-400 bg-black/40 p-2.5 rounded-lg max-h-28 overflow-y-auto whitespace-pre-wrap custom-scrollbar">
                          {tpl}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. SHORTCUT TERMINAL VIEW */}
          {activeNav === 'shortcut' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
              {/* Form Tambah Shortcut */}
              <div className="lg:col-span-5">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                      <span>⌨️</span> Tambah Perintah CLI Shortcut
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nama Shortcut</label>
                      <input
                        placeholder="e.g. Cek Optical Power"
                        value={newShortcutName}
                        onChange={e => setNewShortcutName(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <div className="space-y-1 relative" ref={categoryDropdownRef}>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Kategori OLT</label>
                      <input
                        placeholder="Kategori / Tab (e.g. ZTE C320, HUAWEI)"
                        value={newShortcutCategory}
                        onChange={e => {
                          setNewShortcutCategory(e.target.value);
                          setCategorySearchQuery(e.target.value);
                          setIsCategoryDropdownOpen(true);
                        }}
                        onFocus={() => {
                          setCategorySearchQuery(newShortcutCategory);
                          setIsCategoryDropdownOpen(true);
                        }}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                      {isCategoryDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-32 overflow-y-auto custom-scrollbar">
                          <div className="py-1">
                            {shortcutCategories.filter(c => c.toLowerCase().includes(categorySearchQuery.toLowerCase())).map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => {
                                  setNewShortcutCategory(c);
                                  setIsCategoryDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-emerald-500 hover:text-slate-950"
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                        Placeholder Parameter
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {paramList.map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => insertParam(p, true)}
                            className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 rounded text-[9px] font-mono font-bold"
                          >
                            +{`{${p}}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Perintah CLI (Baris perintah)</label>
                      <textarea
                        ref={shortcutAreaRef}
                        rows={5}
                        placeholder="show pon power attenuation gpon-onu_1/{slot}/{port}:{onu}"
                        value={newShortcutBody}
                        onChange={e => setNewShortcutBody(e.target.value)}
                        className={`w-full p-3 rounded-xl text-xs font-mono outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <button
                      onClick={addShortcut}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all"
                    >
                      Simpan Shortcut CLI
                    </button>
                  </div>
                </div>
              </div>

              {/* Daftar Shortcut */}
              <div className="lg:col-span-7">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex flex-wrap justify-between items-center gap-2 border-slate-800/60">
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Koleksi Perintah CLI ({Object.keys(terminalShortcuts).length})
                    </h3>
                    <div className="flex gap-1.5 overflow-x-auto max-w-full">
                      {shortcutCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setActiveShortcutCategoryTab(cat)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            activeShortcutCategoryTab === cat
                              ? 'bg-emerald-600 text-white shadow-md'
                              : theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-[550px] overflow-y-auto custom-scrollbar pr-1">
                    {(() => {
                      const filtered = Object.entries(terminalShortcuts).filter(([_, s]) => {
                        const cat = typeof s === 'object' && s !== null ? (s as any).category : 'ZTE C320';
                        return cat === activeShortcutCategoryTab;
                      });

                      if (filtered.length === 0) {
                        return <p className="text-xs text-slate-500 italic py-4">Belum ada perintah dalam kategori "{activeShortcutCategoryTab}".</p>;
                      }

                      return filtered.map(([name, s]) => {
                        const body = typeof s === 'object' && s !== null ? (s as any).body : s;
                        return (
                          <div
                            key={name}
                            className={`p-3.5 rounded-xl border space-y-2 ${
                              theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-xs text-emerald-400">{name}</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setNewShortcutName(name); setNewShortcutBody(body); }}
                                  className="text-xs text-cyan-400 hover:underline font-bold"
                                >
                                  Muat
                                </button>
                                <button
                                  onClick={() => deleteShortcut(name)}
                                  className="text-xs text-rose-500 hover:underline font-bold"
                                >
                                  Hapus
                                </button>
                              </div>
                            </div>
                            <pre className="text-[10px] font-mono text-slate-400 bg-black/40 p-2 rounded max-h-20 overflow-y-auto whitespace-pre-wrap">
                              {body}
                            </pre>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. MANAJEMEN PROFILE / SPEED VIEW */}
          {activeNav === 'speed' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
              {/* Form Tambah Profile */}
              <div className="lg:col-span-5">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                      <span>🚀</span> Tambah Profile Bandwidth
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nama Profile Baru</label>
                      <input
                        placeholder="e.g. INTERNET_300M"
                        value={newProfileName}
                        onChange={e => setNewProfileName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addSpeedProfile(); }}
                        className={`w-full p-2.5 rounded-xl text-xs font-mono outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Profile ini akan muncul secara otomatis pada kolom pencarian pilihan kecepatan di formulir aktivasi OLT.
                    </p>

                    <button
                      onClick={addSpeedProfile}
                      className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-cyan-600/20 transition-all"
                    >
                      Tambah Profile Speed
                    </button>
                  </div>
                </div>
              </div>

              {/* Daftar Speed Profile */}
              <div className="lg:col-span-7">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Daftar Paket / Profile Speed ({speedProfiles.length})
                    </h3>
                  </div>

                  <div className="space-y-2 max-h-[550px] overflow-y-auto custom-scrollbar pr-1">
                    {speedProfiles.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-4">Belum ada paket kecepatan.</p>
                    ) : (
                      speedProfiles.map((p, index) => {
                        const isEditing = editingProfileIndex === index;
                        return (
                          <div
                            key={`${p}-${index}`}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                              theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            {isEditing ? (
                              <div className="flex-1 flex items-center gap-2">
                                <input
                                  value={editingProfileValue}
                                  onChange={e => setEditingProfileValue(e.target.value)}
                                  className={`flex-1 p-2 rounded-lg text-xs font-mono border outline-none ${
                                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                                  }`}
                                />
                                <button
                                  onClick={saveEditProfile}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                                >
                                  Simpan
                                </button>
                                <button
                                  onClick={cancelEditProfile}
                                  className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-bold"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="font-mono text-cyan-400 font-bold text-xs">{p}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => startEditProfile(index)}
                                    className="text-cyan-400 hover:underline font-bold text-xs"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => deleteSpeedProfile(index)}
                                    className="text-rose-500 hover:underline font-bold text-xs"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 7. MANAJEMEN USER & HAK AKSES VIEW */}
          {activeNav === 'user' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
              {/* Form Tambah User */}
              <div className="lg:col-span-5">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                      <span>👥</span> Tambah Pengguna Baru
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Username Login</label>
                      <input
                        placeholder="e.g. teknisi1"
                        value={newUserUsername}
                        onChange={e => setNewUserUsername(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nama Lengkap</label>
                      <input
                        placeholder="e.g. Budi Santoso"
                        value={newUserName}
                        onChange={e => setNewUserName(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Password</label>
                      <input
                        type="password"
                        placeholder="Masukkan password"
                        value={newUserPassword}
                        onChange={e => setNewUserPassword(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Role / Peran</label>
                      <select
                        value={newUserRole}
                        onChange={e => setNewUserRole(e.target.value as any)}
                        className={`w-full p-2.5 rounded-xl text-xs outline-none border transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="admin">Administrator (Akses Penuh)</option>
                        <option value="operator">Operator (Konfigurasi & Terminal)</option>
                        <option value="teknisi">Teknisi (Aktivasi Lapangan)</option>
                      </select>
                    </div>

                    <button
                      onClick={addUser}
                      className="w-full mt-2 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-600/20 transition-all"
                    >
                      Simpan User Baru
                    </button>
                  </div>
                </div>
              </div>

              {/* Daftar Pengguna */}
              <div className="lg:col-span-7">
                <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="border-b pb-3 flex justify-between items-center border-slate-800/60">
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Daftar Pengguna Sistem ({users.length})
                    </h3>
                  </div>

                  <div className="space-y-3 max-h-[550px] overflow-y-auto custom-scrollbar pr-1">
                    {users.map(u => {
                      const isEditing = editingUserId === u.id;
                      const isSelf = currentUser?.id === u.id;
                      return (
                        <div
                          key={u.id}
                          className={`p-4 rounded-xl border transition-all ${
                            theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          {isEditing ? (
                            <div className="space-y-3">
                              <div className="font-bold text-cyan-400 text-xs flex items-center justify-between">
                                <span>Edit Akun @{u.username}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Nama Lengkap</label>
                                  <input
                                    placeholder="Nama Lengkap"
                                    value={editUserName}
                                    onChange={e => setEditUserName(e.target.value)}
                                    className={`w-full p-2 rounded-lg text-xs border outline-none ${
                                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                                    }`}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Password Baru (opsional)</label>
                                  <input
                                    type="password"
                                    placeholder="Kosongkan jika tidak diubah"
                                    value={editUserPassword}
                                    onChange={e => setEditUserPassword(e.target.value)}
                                    className={`w-full p-2 rounded-lg text-xs border outline-none ${
                                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                                    }`}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Role</label>
                                <select
                                  value={editUserRole}
                                  onChange={e => setEditUserRole(e.target.value as any)}
                                  className={`w-full p-2 rounded-lg text-xs border outline-none ${
                                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                                  }`}
                                >
                                  <option value="admin">Administrator</option>
                                  <option value="operator">Operator</option>
                                  <option value="teknisi">Teknisi</option>
                                </select>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => saveEditUser(u.id)}
                                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs uppercase"
                                >
                                  Simpan Perubahan
                                </button>
                                <button
                                  onClick={cancelEditUser}
                                  className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg text-xs uppercase"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-sm uppercase shrink-0">
                                  {(u.name || u.username)[0]}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-slate-200">{u.name || u.username}</span>
                                    {isSelf && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono font-bold">
                                        Anda
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                                    <span>@{u.username}</span>
                                    <span>•</span>
                                    <span className={`uppercase font-bold text-[10px] px-2 py-0.5 rounded ${
                                      u.role === 'admin'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : u.role === 'operator'
                                        ? 'bg-cyan-500/20 text-cyan-400'
                                        : 'bg-emerald-500/20 text-emerald-400'
                                    }`}>
                                      {u.role}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => startEditUser(u)}
                                  className="px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 font-bold text-xs uppercase"
                                >
                                  Edit
                                </button>
                                {!isSelf && users.length > 1 && (
                                  <button
                                    onClick={() => deleteUser(u.id)}
                                    className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 font-bold text-xs uppercase"
                                  >
                                    Hapus
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPasteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
              <h2 className="text-xl font-black text-white uppercase mb-4">Kirim Script ke Terminal?</h2>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6 max-h-[500px] overflow-auto font-mono text-[12px] text-cyan-400/90 custom-scrollbar whitespace-pre-wrap">{generatedScript}</div>
              <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setShowPasteConfirm(false)} className="py-3 rounded-2xl bg-slate-800 text-slate-400 font-bold text-sm uppercase hover:bg-slate-700 transition-all">Batal</button>
                  <button onClick={() => sendCommandToTerminal(generatedScript)} className="py-3 rounded-2xl bg-cyan-600 text-white font-bold text-sm uppercase hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-500/20">Ya, Kirim</button>
              </div>
           </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .animate-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        /* Xterm sizing rules */
        .xterm-viewport { overflow-y: hidden !important; }
        .xterm-screen { height: auto !important; }
      `}</style>
    </div>
  );
};

export default App;
