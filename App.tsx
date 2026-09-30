

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { INITIAL_OLT_CONFIG, INITIAL_TEMPLATES } from './constants.ts';
import { ScriptData, OLTConfig, SubTabConfig } from './types.ts';

const getApiBase = () => {
  const savedOverride = localStorage.getItem('api_base_override');
  if (savedOverride) return savedOverride;
  const hostname = window.location.hostname;
  const host = (hostname === 'localhost' || hostname === '127.0.0.1') ? 'localhost' : hostname;
  return `http://${host}:3001`;
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

type TerminalState = 'NORMAL' | 'PASSWORD' | 'NOECHO' | 'USERNAME';

const App: React.FC = () => {
  const [apiBase] = useState(getApiBase());
  const [oltConfigs, setOltConfigs] = useState<Record<string, OLTConfig>>(INITIAL_OLT_CONFIG || {});
  const [templates, setTemplates] = useState<Record<string, string>>(INITIAL_TEMPLATES || {});
  const [terminalShortcuts, setTerminalShortcuts] = useState<Record<string, { body: string; category: string } | string>>({});
  const [speedProfiles, setSpeedProfiles] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [isLoading, setIsLoading] = useState(true);

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
  const [selectedOLT, setSelectedOLT] = useState<string>('');
  const [selectedSub, setSelectedSub] = useState<string>('');
  const [showAdmin, setShowAdmin] = useState(false);
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
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
      }
    } catch (err) { setSyncStatus('error'); } finally { setIsLoading(false); }
  }, [apiBase]);

  useEffect(() => { loadData(); }, [loadData]);

  const saveToServer = useCallback(async (configs: any, tpls: any, shortcuts: any, profilesOpt?: string[]) => {
    setSyncStatus('syncing');
    try {
      const targetProfiles = profilesOpt !== undefined ? profilesOpt : speedProfiles;
      const response = await fetch(`${apiBase}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oltConfigs: configs, templates: tpls, terminalShortcuts: shortcuts, speedProfiles: targetProfiles })
      });
      if (response.ok) setSyncStatus('synced'); else setSyncStatus('error');
    } catch (err) { setSyncStatus('error'); }
  }, [apiBase, speedProfiles]);

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

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center bg-[#020617] text-slate-200">
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center space-y-4">
           <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
           <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Memuat Data...</p>
        </div>
      )}

      <div className="w-full max-w-7xl">
        <header className="mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-3xl md:text-4xl font-black text-white bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent uppercase tracking-tighter">Whusnet OLT Pro</h1>
            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-3 mt-1">
               <span className={`w-2 h-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></span>
               <span>{apiBase}</span>
            </div>
          </div>
          <button onClick={() => setShowAdmin(!showAdmin)} className="px-6 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold hover:bg-slate-700 uppercase tracking-widest transition-all">Pengaturan</button>
        </header>

        {showAdmin && (
          <div className="space-y-6 mb-10 p-4 md:p-6 bg-slate-900 border border-slate-800 rounded-3xl animate-in fade-in duration-300 shadow-2xl overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-4 flex flex-col">
                <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest border-b border-slate-800 pb-2">Manajemen OLT</h3>
                <div className="space-y-2">
                  <input placeholder="Nama OLT" value={newNodeName} onChange={e => setNewNodeName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs outline-none" />
                  <input placeholder="IP Address" value={newNodeIP} onChange={e => setNewNodeIP(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs outline-none" />
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Username" value={newNodeUser} onChange={e => setNewNodeUser(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs outline-none" />
                    <input type="password" placeholder="Password" value={newNodePass} onChange={e => setNewNodePass(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs outline-none" />
                  </div>
                  <button onClick={addNode} className="w-full bg-cyan-600 font-bold py-2 rounded-lg text-[10px] uppercase hover:bg-cyan-500 transition-all">Simpan OLT</button>
                </div>
                <div className="flex-1 max-h-48 overflow-auto space-y-1 custom-scrollbar pr-1">
                    {Object.keys(oltConfigs).map(k => (
                        <div key={k} className="flex justify-between items-center bg-slate-950 p-2 rounded text-[10px] border border-slate-800">
                            <span>{k}</span>
                            <button onClick={() => deleteNode(k)} className="text-rose-500 font-bold hover:text-rose-400">Hapus</button>
                        </div>
                    ))}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 flex flex-col">
                <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-2">Area & VLAN</h3>
                <div className="space-y-2">
                  <select value={targetNodeForSub} onChange={e => setTargetNodeForSub(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs">
                    <option value="">Pilih OLT...</option>
                    {Object.keys(oltConfigs).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input placeholder="Nama Area" value={newSubName} onChange={e => setNewSubName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs outline-none" />
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="VLAN ID" value={newSubVlan} onChange={e => setNewSubVlan(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs" />
                    <input placeholder="VLAN Profile" value={newSubProfile} onChange={e => setNewSubProfile(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="PPP Prefix" value={newSubPrefix} onChange={e => setNewSubPrefix(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs" />
                    <select value={newSubTemplate} onChange={e => setNewSubTemplate(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs">
                      <option value="">Template...</option>
                      {Object.keys(templates).map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <button onClick={addSubArea} className="w-full bg-blue-600 font-bold py-2 rounded-lg text-[10px] uppercase hover:bg-blue-500 transition-all">Simpan Area</button>
                </div>
                <div className="flex-1 max-h-48 overflow-auto space-y-1 custom-scrollbar pr-1">
                    {(Object.entries(oltConfigs) as [string, OLTConfig][]).flatMap(([nodeKey, cfg]) => 
                        Object.keys(cfg.subtabs || {}).map(subKey => (
                            <div key={`${nodeKey}-${subKey}`} className="flex justify-between items-center bg-slate-950 p-2 rounded text-[10px] border border-slate-800">
                                <span className="truncate">{nodeKey} {' > '} {subKey}</span>
                                <button onClick={() => deleteSubArea(nodeKey, subKey)} className="text-rose-500 font-bold hover:text-rose-400 ml-2">Hapus</button>
                            </div>
                        ))
                    )}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 flex flex-col">
                <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest border-b border-slate-800 pb-2">Script Designer</h3>
                <input placeholder="Nama Template" value={newTplName} onChange={e => setNewTplName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs outline-none" />
                <div className="flex flex-wrap gap-1">
                  {paramList.map(p => <button key={p} onClick={() => insertParam(p)} className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[8px] font-mono text-purple-400 hover:bg-slate-700 transition-all">+{p}</button>)}
                </div>
                <textarea value={newTplBody} onChange={e => setNewTplBody(e.target.value)} ref={templateAreaRef} rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-[10px] font-mono" />
                <button onClick={addTemplate} className="w-full bg-purple-600 font-bold py-2 rounded-lg text-[10px] uppercase hover:bg-purple-500 transition-all">Simpan Script</button>
                <div className="flex-1 max-h-32 overflow-auto space-y-1 custom-scrollbar pr-1">
                    {Object.keys(templates).map(k => (
                        <div key={k} className="flex justify-between items-center bg-slate-950 p-2 rounded text-[10px] border border-slate-800">
                            <span>{k}</span>
                            <button onClick={() => deleteTemplate(k)} className="text-rose-500 font-bold">Hapus</button>
                        </div>
                    ))}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 flex flex-col">
                <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest border-b border-slate-800 pb-2">Terminal Commands</h3>
                <input placeholder="Nama Perintah" value={newShortcutName} onChange={e => setNewShortcutName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs outline-none" />
                
                <div className="space-y-1 relative" ref={categoryDropdownRef}>
                  <input 
                    placeholder="Kategori / List (e.g. Umum, Basic)" 
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
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setIsCategoryDropdownOpen(false);
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs outline-none font-medium" 
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      setCategorySearchQuery('');
                      setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                    }}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.4 w-3.4 transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {isCategoryDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-32 overflow-y-auto custom-scrollbar">
                      <div className="py-1">
                        {(() => {
                          const filtered = shortcutCategories.filter(c => 
                            c.toLowerCase().includes(categorySearchQuery.toLowerCase())
                          );
                          if (filtered.length === 0) {
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCategoryDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 text-[10px] text-slate-400 italic"
                              >
                                Gunakan "{newShortcutCategory}" sebagai kategori baru
                              </button>
                            );
                          }
                          return filtered.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                setNewShortcutCategory(c);
                                setIsCategoryDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-emerald-500 hover:text-slate-900 transition-colors ${newShortcutCategory === c ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-300'}`}
                            >
                              {c}
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {paramList.map(p => <button key={p} onClick={() => insertParam(p, true)} className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[8px] font-mono text-emerald-400 hover:bg-slate-700 transition-all">+{p}</button>)}
                </div>
                <textarea value={newShortcutBody} onChange={e => setNewShortcutBody(e.target.value)} ref={shortcutAreaRef} rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-[10px] font-mono" />
                <button onClick={addShortcut} className="w-full bg-emerald-600 font-bold py-2 rounded-lg text-[10px] uppercase hover:bg-emerald-500 transition-all">Simpan Shortcut</button>
                <div className="flex-1 max-h-32 overflow-auto space-y-1 custom-scrollbar pr-1">
                    {Object.entries(terminalShortcuts).map(([k, val]) => {
                        const cat = val && typeof val === 'object' ? val.category : 'ZTE C320';
                        return (
                            <div key={k} className="flex justify-between items-center bg-slate-950 p-2 rounded text-[10px] border border-slate-800">
                                <span className="truncate max-w-[120px]"><span className="text-emerald-500 font-bold">[{cat}]</span> {k}</span>
                                <button onClick={() => deleteShortcut(k)} className="text-rose-500 font-bold ml-1 shrink-0 hover:text-rose-400">Hapus</button>
                            </div>
                        );
                    })}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 flex flex-col">
                <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest border-b border-slate-800 pb-2">Manajemen Profile / Speed</h3>
                <div className="space-y-2">
                  <input 
                    placeholder="Nama Profile Baru" 
                    value={newProfileName} 
                    onChange={e => setNewProfileName(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter') addSpeedProfile(); }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs outline-none" 
                  />
                  <button onClick={addSpeedProfile} className="w-full bg-cyan-600 font-bold py-2 rounded-lg text-[10px] uppercase hover:bg-cyan-500 transition-all">Tambah Profile</button>
                </div>
                <div className="flex-1 max-h-48 overflow-auto space-y-1 custom-scrollbar pr-1">
                    {speedProfiles.map((p, index) => (
                        <div key={p + '-' + index} className="flex flex-col bg-slate-950 p-1.5 rounded text-[10px] border border-slate-800 space-y-1">
                            {editingProfileIndex === index ? (
                              <div className="space-y-1">
                                <input 
                                  value={editingProfileValue} 
                                  onChange={e => setEditingProfileValue(e.target.value)} 
                                  className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-[10px] outline-none" 
                                />
                                <div className="flex justify-end gap-1">
                                  <button onClick={cancelEditProfile} className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] hover:bg-slate-700">Batal</button>
                                  <button onClick={saveEditProfile} className="px-2 py-0.5 bg-cyan-600 text-slate-900 rounded font-bold text-[10px] hover:bg-cyan-500">Simpan</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-between items-center">
                                <span className="font-mono text-cyan-400 truncate max-w-[100px]" title={p}>{p}</span>
                                <div className="flex gap-2">
                                  <button onClick={() => startEditProfile(index)} className="text-cyan-400 hover:text-cyan-300 font-bold">Edit</button>
                                  <button onClick={() => deleteSpeedProfile(index)} className="text-rose-500 hover:text-rose-400 font-bold">Hapus</button>
                                </div>
                              </div>
                            )}
                        </div>
                    ))}
                    {speedProfiles.length === 0 && (
                      <span className="text-[10px] text-slate-600 italic">Belum ada profile terdaftar.</span>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto lg:h-[1300px]">
          <div className="lg:col-span-5 space-y-6 overflow-y-auto lg:custom-scrollbar pr-0 lg:pr-2">
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl relative">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pilih Node OLT</h3>
                {Object.keys(oltConfigs).length > 5 && (
                    <button onClick={() => setIsOLTExpanded(!isOLTExpanded)} className="text-[10px] font-bold text-cyan-500 uppercase bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 hover:bg-cyan-500/20 transition-all">
                        {isOLTExpanded ? 'Show Less' : 'View All'}
                    </button>
                )}
              </div>
              <div className={`flex flex-wrap gap-2 overflow-hidden transition-all duration-500 ease-in-out ${isOLTExpanded ? 'max-h-[1000px]' : 'max-h-[44px]'}`}>
                {Object.keys(oltConfigs).length === 0 ? <span className="text-[10px] text-slate-600 italic">Data OLT Kosong.</span> : 
                  Object.keys(oltConfigs).map(k => (
                    <button key={k} onClick={() => { setSelectedOLT(k); setSelectedSub(''); }} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${selectedOLT === k ? 'bg-cyan-500 text-slate-900 border-cyan-400 shadow-lg shadow-cyan-500/20' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'}`}>{k}</button>
                ))}
              </div>
              {selectedOLT && oltConfigs[selectedOLT] && (
                <div className="pt-6 mt-6 border-t border-slate-800 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pilih Area & VLAN</h3>
                        {Object.keys((oltConfigs[selectedOLT] as OLTConfig).subtabs || {}).length > 8 && (
                            <button onClick={() => setIsAreaExpanded(!isAreaExpanded)} className="text-[10px] font-bold text-blue-500 uppercase bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 hover:bg-blue-500/20 transition-all">
                                {isAreaExpanded ? 'Show Less' : 'View All'}
                            </button>
                        )}
                    </div>
                    <div className={`flex flex-wrap gap-2 overflow-hidden transition-all duration-500 ease-in-out ${isAreaExpanded ? 'max-h-[1000px]' : 'max-h-[44px]'}`}>
                        {Object.keys((oltConfigs[selectedOLT] as OLTConfig).subtabs || {}).map(s => (
                            <button key={s} onClick={() => setSelectedSub(s)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${selectedSub === s ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700 hover:text-slate-300'}`}>{s}</button>
                        ))}
                    </div>
                </div>
              )}
            </section>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4 shadow-xl">
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-950 border border-slate-800 rounded p-2 flex flex-col"><span className="text-[7px] text-slate-500 uppercase font-bold">Target IP</span><span className="text-[10px] font-mono text-cyan-400">{currentOltIP || '0.0.0.0'}</span></div>
                    <div className="bg-slate-950 border border-slate-800 rounded p-2 flex flex-col"><span className="text-[7px] text-slate-500 uppercase font-bold">VLAN ID</span><span className="text-[10px] font-mono text-blue-400">{currentCfg?.vlan || '----'}</span></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Slot</label><input value={slot} onChange={e => setSlot(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm outline-none" /></div>
                    <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Port</label><input value={port} onChange={e => setPort(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm outline-none" /></div>
                    <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">ONU ID</label><input value={onu} onChange={e => setOnu(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm outline-none" /></div>
                </div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Serial Number (SN)</label><input value={sn} onChange={e => setSn(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm font-mono outline-none uppercase" placeholder="ZTEGC..." /></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">ODP / Label</label><input value={odp} onChange={e => setOdp(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm outline-none" placeholder="ODP-..." /></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">PPPoE User</label>
                    <div className="flex gap-2">
                        <div className="bg-slate-950 border border-slate-800 rounded px-2 py-2 text-[10px] text-slate-500 font-mono flex items-center min-w-[60px]">{currentCfg?.ppp_prefix || '...'}</div>
                        <input value={pppSuffix} onChange={e => setPppSuffix(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded p-2 text-sm outline-none" placeholder="username" />
                    </div>
                </div>
                <div className="space-y-1 relative" ref={dropdownRef}>
                  <label className="text-[10px] text-slate-500 font-bold uppercase">Profile / Speed</label>
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
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 pr-8 text-sm outline-none font-medium text-slate-100" 
                      placeholder="Cari atau ketik Profile..." 
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        setProfileSearchQuery('');
                        setIsProfileDropdownOpen(!isProfileDropdownOpen);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-200 ${isProfileDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  
                  {isProfileDropdownOpen && (
                    <div ref={optionsContainerRef} className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                      {/* Search inline */}
                      <div className="p-2 border-b border-slate-800 sticky top-0 bg-slate-900">
                        <input
                          type="text"
                          placeholder="Ketik untuk mencari..."
                          value={profileSearchQuery}
                          onChange={e => setProfileSearchQuery(e.target.value)}
                          onKeyDown={handleProfileKeyDown}
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      {/* List options */}
                      <div className="py-1">
                        {(() => {
                          if (filteredProfiles.length === 0) {
                            return (
                              <div className="px-3 py-2 text-xs text-slate-500 italic">
                                Tidak ada profile cocok. Coba simpan di Pengaturan atau gunakan teks kustom Anda.
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
                                  ? 'bg-cyan-500 text-slate-975 font-semibold shadow-inner' 
                                  : profile === p 
                                    ? 'bg-cyan-500/20 text-cyan-400 font-medium' 
                                    : 'text-slate-300 hover:bg-slate-800/80'
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
                
                <div className="space-y-1 pt-2 border-t border-slate-800/50"><label className="text-[10px] text-slate-500 font-bold uppercase">Eth Port Lock (ONU)</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map(n => (
                            <button key={n} onClick={() => setLocks(prev => ({ ...prev, [n]: !prev[n] }))} className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${locks[n] ? 'bg-rose-500/20 border-rose-500 text-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]' : 'bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'}`}>{locks[n] ? `Eth${n} LOCK` : `Eth${n} OPEN`}</button>
                        ))}
                    </div>
                </div>
            </section>
          </div>

          <div className="lg:col-span-7 flex flex-col h-[1100px] lg:h-full overflow-hidden">
            <section className="bg-slate-900 border border-slate-800 rounded-3xl flex flex-col h-full overflow-hidden shadow-2xl relative">
              <div className="flex bg-slate-800/40 border-b border-slate-800 shrink-0">
                <button onClick={() => setActiveRightTab('script')} className={`flex-1 py-4 text-[10px] font-bold uppercase ${activeRightTab === 'script' ? 'text-cyan-400 border-b-2 border-cyan-500 bg-cyan-400/5' : 'text-slate-500'}`}>Script Preview</button>
                <button onClick={() => setActiveRightTab('telnet')} className={`flex-1 py-4 text-[10px] font-bold uppercase ${activeRightTab === 'telnet' ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-400/5' : 'text-slate-500'}`}>Live Terminal</button>
              </div>

              {/* SCRIPT PREVIEW PANEL */}
              <div className={`flex-1 flex flex-col p-4 md:p-6 bg-[#0a0f1e] overflow-hidden ${activeRightTab !== 'script' ? 'hidden' : ''}`}>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-mono text-slate-600 uppercase">Script Output</span>
                  <div className="flex gap-2">
                      <button onClick={openWebOLT} className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-[10px] font-bold text-slate-300 hover:text-white transition-all uppercase">Web OLT</button>
                      <button onClick={() => copyToClipboard(generatedScript)} className={`px-4 md:px-6 py-2 rounded-xl text-[10px] font-bold transition-all ${copySuccess ? 'bg-emerald-600 shadow-lg shadow-emerald-500/30' : 'bg-cyan-600 shadow-lg shadow-cyan-500/30'}`}>{copySuccess ? 'BERHASIL!' : 'SALIN SCRIPT'}</button>
                  </div>
                </div>
                <pre className="flex-1 overflow-auto text-[13px] font-mono text-cyan-50/80 bg-slate-950/40 p-4 rounded-xl border border-slate-800 whitespace-pre-wrap custom-scrollbar">{generatedScript}</pre>
              </div>

              {/* LIVE TERMINAL PANEL - Improved layout to keep Quick Commands right under the terminal lines */}
              <div className={`flex-1 flex flex-col bg-[#050505] overflow-hidden relative ${activeRightTab !== 'telnet' ? 'hidden' : ''}`}>
                 <div className="p-3 border-b border-emerald-900/10 bg-[#080c14] z-10 shrink-0 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 overflow-hidden">
                          <div className={`shrink-0 w-2 h-2 rounded-full ${isTelnetConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></div>
                          <span className="text-[10px] font-bold text-emerald-500 uppercase truncate">
                              {isTelnetConnected ? `OLT: ${selectedOLT || currentOltIP}` : isTelnetConnecting ? 'CONNECTING...' : 'OFFLINE'}
                          </span>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                         <div className="hidden md:flex items-center gap-2">
                             <span className="text-[8px] text-slate-500 font-bold uppercase">Size: {terminalFontSize}</span>
                             <input type="range" min="8" max="20" value={terminalFontSize} onChange={(e) => setTerminalFontSize(parseInt(e.target.value))} className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                         </div>

                         <div className="flex gap-1">
                             <button onClick={loginOLTAuto} disabled={!isTelnetConnected} title="Auto Login OLT" className="px-2 py-1 bg-slate-800 border border-slate-700 text-amber-500 rounded text-[8px] font-bold uppercase hover:bg-slate-700 disabled:opacity-30">Login</button>

                             
                             {!isTelnetConnected ? 
                               <button onClick={connectTerminal} disabled={isTelnetConnecting} className="px-3 py-1 bg-emerald-600 text-white rounded text-[8px] font-bold uppercase disabled:opacity-50 hover:bg-emerald-500 transition-all">Connect</button> : 
                               <div className="flex gap-1">
                                  <button onClick={disconnectTerminal} className="px-3 py-1 bg-rose-600 text-white rounded text-[8px] font-bold uppercase hover:bg-rose-500 transition-all">DISCONNECT</button>
                                  <button onClick={() => setShowPasteConfirm(true)} className="px-3 py-1 bg-cyan-600 text-white rounded text-[8px] font-bold uppercase hover:bg-cyan-500 transition-all">PASTE</button>
                               </div>
                             }
                         </div>
                      </div>
                 </div>
                 
                 {/* Scrollable area grouping terminal lines and shortcuts bar together */}
                 <div className="flex-1 overflow-auto custom-scrollbar bg-black relative">
                    {/* The terminal wrapper - height will depend on row count and font size */}
                    <div ref={terminalContainerRef} className="w-full shrink-0" />
                    
                    {/* QUICK COMMANDS - Now placed exactly under the terminal lines (after line 45) */}
                    <div className="bg-[#0b101a] border-t border-slate-800 shrink-0 flex flex-col z-10 sticky bottom-0 lg:static">
                        <div className="flex flex-wrap items-center justify-between px-3 py-0.5 bg-[#0b101a]/95 border-b border-slate-800/40 gap-2">
                            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none max-w-full">
                                {shortcutCategories.map(cat => (
                                    <button 
                                      key={cat}
                                      type="button"
                                      onClick={() => setActiveShortcutCategoryTab(cat)}
                                      className={`px-1 py-1 rounded-md text-[11px] font-bold uppercase transition-all whitespace-nowrap ${
                                        activeShortcutCategoryTab === cat 
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]' 
                                          : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-800/30'
                                      }`}
                                    >
                                      {cat}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">Quick Commands</span>
                                {Object.keys(terminalShortcuts).length > 6 && (
                                    <button onClick={() => setIsShortcutsExpanded(!isShortcutsExpanded)} className="text-[7px] font-bold text-emerald-500 uppercase px-2 hover:bg-emerald-500/5 transition-all">
                                        {isShortcutsExpanded ? 'Show Less' : 'View All'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className={`overflow-y-auto p-2 custom-scrollbar flex flex-wrap gap-1.5 content-start transition-all duration-100 bg-[#0b101a]/95 ${isShortcutsExpanded ? 'h-48' : 'h-16'}`}>
                            {(() => {
                              const filtered = Object.entries(terminalShortcuts).filter(([_, s]) => {
                                const cat = typeof s === 'object' && s !== null ? s.category : 'ZTE C320';
                                return cat === activeShortcutCategoryTab;
                              });
                              
                              if (filtered.length === 0) {
                                return <span className="text-[11px] text-slate-500 italic px-2 py-1">Belum ada perintah dalam kategori ini.</span>;
                              }
                              
                              return filtered.map(([name, s]) => {
                                const script = typeof s === 'object' && s !== null ? s.body : s;
                                return (
                                  <button 
                                    key={name} 
                                    onClick={() => isTelnetConnected && sendCommandToTerminal(script)} 
                                    disabled={!isTelnetConnected}
                                    className={`px-1 py-1 bg-slate-800/50 border border-slate-700/60 rounded-md text-[11px] font-sans font-bold uppercase transition-all 
                                      ${isTelnetConnected ? 'text-slate-200 hover:text-emerald-400 hover:border-emerald-500 hover:bg-slate-800' : 'text-slate-600 opacity-50 cursor-not-allowed'}`}
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
