
import React, { useState, useMemo, useEffect } from 'react';
import { Department, User, AuditGroup } from '@shared/types';
import { X, Building2, User as UserIcon, FileText, Search, ChevronDown, Boxes, Layers, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dept: Omit<Department, 'id'> | Partial<Department>) => void;
  initialData?: Department | null;
  users: User[];
  isAdmin: boolean;
  isCoordinator?: boolean;
  auditGroups?: AuditGroup[];
}

export const DepartmentModal: React.FC<DepartmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  users,
  isAdmin,
  isCoordinator = false,
  auditGroups = []
}) => {
  const [formData, setFormData] = useState({
    name: '',
    abbr: '',
    headOfDeptId: '',
    description: '',
    totalAssets: 0,
    auditGroupId: '',
    auditorsRequiredOverride: undefined as number | undefined
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isHeadDropdownOpen, setIsHeadDropdownOpen] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        abbr: initialData.abbr || '',
        headOfDeptId: initialData.headOfDeptId || '',
        description: initialData.description || '',
        totalAssets: initialData.totalAssets || 0,
        auditGroupId: initialData.auditGroupId || '',
        auditorsRequiredOverride: initialData.auditorsRequiredOverride
      });
    } else {
      setFormData({
        name: '',
        abbr: '',
        headOfDeptId: '',
        description: '',
        totalAssets: 0,
        auditGroupId: '',
        auditorsRequiredOverride: undefined
      });
    }
    setSearchQuery('');
    setIsHeadDropdownOpen(false);
  }, [initialData, isOpen]);

  const filteredHeads = useMemo(() => {
    let base = users;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      base = base.filter(u => 
        u.name.toLowerCase().includes(q) || 
        u.id.toLowerCase().includes(q)
      );
    }
    
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [users, searchQuery]);

  const selectedHead = useMemo(() => 
    users.find(u => u.id === formData.headOfDeptId),
    [users, formData.headOfDeptId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Exclude totalAssets — it is auto-calculated from location totals and must not be overwritten by the form
    const { totalAssets: _ignored, ...saveData } = formData;
    onSave(saveData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 border-none rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] bg-white">
        <DialogHeader className="bg-indigo-600 p-6 text-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">{initialData ? 'Edit Department' : 'New Department'}</DialogTitle>
              <DialogDescription className="text-indigo-100 text-xs mt-0.5">
                Define core organizational unit parameters.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto p-6 md:p-8 custom-scrollbar bg-white">
          <form id="department-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Department Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                  <Input 
                    required
                    placeholder="e.g. Faculty of Engineering"
                    className="pl-11 h-12 bg-slate-50 border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Abbreviation</Label>
                <Input 
                  required
                  placeholder="e.g. FENG"
                  className="h-12 px-4 bg-slate-50 border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  value={formData.abbr}
                  onChange={e => setFormData({ ...formData, abbr: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Consolidation Group (Audit Group)</Label>
              <Select 
                value={formData.auditGroupId} 
                onValueChange={val => setFormData({ ...formData, auditGroupId: val })}
              >
                <SelectTrigger className="w-full h-12 pl-11 bg-slate-50 border-slate-200 rounded-2xl text-sm font-bold">
                  <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                  <SelectValue placeholder="No Group (Independent Unit)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Group (Independent Unit)</SelectItem>
                  {auditGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 relative">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Head Of Department</Label>
              <Popover open={isHeadDropdownOpen} onOpenChange={setIsHeadDropdownOpen}>
                <PopoverTrigger
                  role="combobox"
                  disabled={!isAdmin && !isCoordinator}
                  className={cn(
                    "w-full h-12 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-slate-50",
                    (!isAdmin && !isCoordinator) || !formData.headOfDeptId ? "text-slate-400 font-medium" : "text-slate-900"
                  )}
                >
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                    {selectedHead ? (
                      <span className="text-slate-900">{selectedHead.name} <span className="text-slate-400 font-medium ml-1">({selectedHead.id})</span></span>
                    ) : (
                      <span>Select Head Of Department...</span>
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 rounded-2xl overflow-hidden shadow-2xl bg-white border-slate-200">
                  <Command className="bg-white">
                    <CommandInput placeholder="Search by name or staff ID..." className="h-12" />
                    <CommandList>
                      <CommandEmpty className="p-4 text-center">
                        <UserIcon className="w-8 h-8 text-slate-100 mx-auto mb-2" />
                        <p className="text-xs text-slate-400 font-bold">No users found</p>
                      </CommandEmpty>
                      <CommandGroup>
                        {users.map(u => (
                          <CommandItem
                            key={u.id}
                            value={u.name + " " + u.id}
                            onSelect={() => {
                              setFormData({ ...formData, headOfDeptId: u.id });
                              setIsHeadDropdownOpen(false);
                            }}
                            className="flex items-center justify-between p-3 hover:bg-indigo-50 cursor-pointer"
                          >
                            <div>
                              <div className="text-sm font-bold text-slate-900">{u.name}</div>
                              <div className="text-[10px] text-slate-400 font-medium">{u.id} • {u.roles.join(', ')}</div>
                            </div>
                            {formData.headOfDeptId === u.id && (
                              <Check className="h-4 w-4 text-indigo-500" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Total Assets</Label>
                <div className="relative">
                  <Boxes className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                  <Input 
                    type="number"
                    min="0"
                    readOnly
                    className="pl-11 h-12 bg-slate-100 border-slate-200 rounded-2xl text-sm font-bold text-slate-400 cursor-not-allowed select-none"
                    value={formData.totalAssets}
                  />
                </div>
                <p className="text-[10px] text-slate-400 ml-1">Auto-calculated from location totals.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Manual Auditor Target</Label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                  <Input 
                    type="number"
                    min="0"
                    placeholder="Auto (Formula)"
                    className="pl-11 h-12 bg-slate-50 border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    value={formData.auditorsRequiredOverride ?? ''}
                    onChange={e => setFormData({ ...formData, auditorsRequiredOverride: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                  />
                </div>
                <p className="text-[10px] text-slate-400 ml-1">Overrides the asset-based target coverage.</p>
              </div>
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Notes / Mission</Label>
              <div className="relative">
                <FileText className="absolute left-4 top-3.5 text-slate-300 w-4 h-4" />
                <Textarea 
                  placeholder="Brief description of the department..."
                  className="pl-11 min-h-12 bg-slate-50 border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>

          </form>
        </div>

        <DialogFooter className="p-6 md:p-8 border-t border-slate-100 bg-slate-50/50 flex flex-col-reverse sm:flex-row gap-4 shrink-0 sm:justify-start">
          <Button 
            variant="outline"
            onClick={onClose}
            className="flex-1 py-6 bg-white border border-slate-200 text-slate-600 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-100 transition-all shadow-sm"
          >
            Discard Changes
          </Button>
          <Button 
            type="submit"
            form="department-form"
            className="flex-2 py-6 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 border-none"
          >
            {initialData ? 'Save Modifications' : 'Initialize Department'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
