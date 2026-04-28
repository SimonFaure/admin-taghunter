import { useState, useEffect, useRef } from 'react';
import { Mail, ChevronDown, User, X } from 'lucide-react';
import { authService } from '../services/authService';

interface Client {
  id: string;
  name: string;
  email: string;
  company: string;
}

interface ClientSelectorProps {
  value: string;
  onChange: (email: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export function ClientSelector({ value, onChange, label = 'Client Email', placeholder = 'Enter client email', required = false }: ClientSelectorProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [inputValue, setInputValue] = useState(value);
  const isAdmin = authService.isAdmin();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchClients();
    }
  }, [isAdmin]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchClients = async () => {
    const email = authService.getEmail();
    if (!email) return;

    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE_URL}/clients.php?action=creator_list&email=${encodeURIComponent(email)}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) setClients(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter((c) => {
    if (!inputValue) return true;
    const q = inputValue.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q)
    );
  });

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setInputValue(client.email);
    onChange(client.email);
    setShowDropdown(false);
  };

  const handleInputChange = (v: string) => {
    setInputValue(v);
    onChange(v);
    setSelectedClient(null);
    if (isAdmin && clients.length > 0) setShowDropdown(true);
  };

  const handleClearSelection = () => {
    setSelectedClient(null);
    setInputValue('');
    onChange('');
  };

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="block text-sm font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      {selectedClient ? (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-700 border border-blue-500/50 rounded-lg">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600/20 shrink-0">
            <User className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{selectedClient.name}</div>
            <div className="text-xs text-slate-400 truncate">{selectedClient.email}</div>
            {selectedClient.company && (
              <div className="text-xs text-slate-500 truncate">{selectedClient.company}</div>
            )}
          </div>
          <button
            type="button"
            onClick={handleClearSelection}
            className="text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="email"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => isAdmin && clients.length > 0 && setShowDropdown(true)}
            placeholder={placeholder}
            required={required}
            autoComplete="off"
            className="w-full pl-10 pr-10 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          {isAdmin && clients.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
            </button>
          )}

          {showDropdown && isAdmin && (
            <div className="absolute z-50 mt-1.5 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden">
              {loading ? (
                <div className="px-4 py-3 text-sm text-slate-400">Loading clients...</div>
              ) : filteredClients.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-400">No clients match</div>
              ) : (
                <div className="max-h-56 overflow-y-auto">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectClient(client)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-b-0"
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-600 shrink-0">
                        <User className="w-3.5 h-3.5 text-slate-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-200 truncate">{client.name}</div>
                        <div className="text-xs text-slate-400 truncate">{client.email}</div>
                        {client.company && (
                          <div className="text-xs text-slate-500 truncate">{client.company}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
