import { useState } from 'react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import { GripVertical, Plus, Pencil, Trash2, Check, RotateCcw, ChevronDown } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';
import { WidgetGroup, WidgetKey, WIDGET_META, useWidgetConfig } from '@/hooks/useWidgetConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

const ICON_OPTIONS = ['❤️', '🍎', '💪', '✨', '🎯', '🏃', '🧠', '💧', '🌙', '🏆', '🔔', '📊', '⚡', '🔥', '💊', '👣'];

interface WidgetGroupSectionProps {
  group: WidgetGroup;
  editMode: boolean;
  renderWidget: (key: WidgetKey) => React.ReactNode;
  onReorder: (groupId: string, newOrder: WidgetKey[]) => void;
  onRename: (groupId: string, title: { en: string; vi: string }, icon?: string) => void;
  onRemove: (groupId: string) => void;
}

export function WidgetGroupSection({ group, editMode, renderWidget, onReorder, onRename, onRemove }: WidgetGroupSectionProps) {
  const { lang } = useAppSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(group.title[lang] || group.title.en);
  const [iconInput, setIconInput] = useState(group.icon);

  const handleSaveName = () => {
    onRename(group.id, { ...group.title, [lang]: nameInput }, iconInput);
    setEditing(false);
  };

  if (group.widgets.length === 0 && !editMode) return null;

  return (
    <motion.div layout transition={spring} className="space-y-2">
      {/* Group Header */}
      <div className="flex items-center gap-2 px-1">
        {editMode && (
          <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        )}

        {editing ? (
          <div className="flex-1 flex items-center gap-2">
            <div className="flex gap-1 flex-wrap max-w-[160px]">
              {ICON_OPTIONS.map(ic => (
                <button key={ic} onClick={() => setIconInput(ic)}
                  className={`text-base w-7 h-7 rounded-lg flex items-center justify-center transition-all ${ic === iconInput ? 'bg-primary/20 ring-1 ring-primary/40' : 'hover:bg-secondary/40'}`}
                >{ic}</button>
              ))}
            </div>
            <Input value={nameInput} onChange={e => setNameInput(e.target.value)} className="h-8 text-sm flex-1" />
            <Button size="sm" variant="ghost" onClick={handleSaveName} className="h-8 w-8 p-0"><Check className="w-4 h-4" /></Button>
          </div>
        ) : (
          <>
            <button onClick={() => !editMode && setCollapsed(c => !c)} className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-base">{group.icon}</span>
              <span className="text-sm font-semibold text-foreground/80 truncate">
                {group.title[lang] || group.title.en}
              </span>
              {!editMode && (
                <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </motion.div>
              )}
            </button>
            {editMode && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(true); setNameInput(group.title[lang] || group.title.en); setIconInput(group.icon); }} className="h-7 w-7 p-0">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onRemove(group.id)} className="h-7 w-7 p-0 text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Widgets */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
            {editMode ? (
              <Reorder.Group
                axis="y"
                values={group.widgets}
                onReorder={(newOrder) => onReorder(group.id, newOrder as WidgetKey[])}
                className="space-y-2"
              >
                {group.widgets.map(widgetKey => (
                  <Reorder.Item key={widgetKey} value={widgetKey} className="list-none">
                    <div className="flex items-center gap-2">
                      <div className="cursor-grab active:cursor-grabbing p-1">
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">{renderWidget(widgetKey)}</div>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            ) : (
              <div className="space-y-2">
                {group.widgets.map(widgetKey => (
                  <motion.div key={widgetKey} layout transition={spring}>
                    {renderWidget(widgetKey)}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface AddGroupDialogProps {
  onAdd: (title: { en: string; vi: string }, icon: string) => void;
  onClose: () => void;
}

export function AddGroupInline({ onAdd, onClose }: AddGroupDialogProps) {
  const { lang } = useAppSettings();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📊');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 space-y-3">
      <p className="text-sm font-semibold">{lang === 'vi' ? 'Thêm nhóm mới' : 'Add new group'}</p>
      <div className="flex gap-1.5 flex-wrap">
        {ICON_OPTIONS.map(ic => (
          <button key={ic} onClick={() => setIcon(ic)}
            className={`text-base w-8 h-8 rounded-lg flex items-center justify-center transition-all ${ic === icon ? 'bg-primary/20 ring-1 ring-primary/40' : 'hover:bg-secondary/40'}`}
          >{ic}</button>
        ))}
      </div>
      <Input placeholder={lang === 'vi' ? 'Tên nhóm...' : 'Group name...'} value={name} onChange={e => setName(e.target.value)} className="h-9" />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>{lang === 'vi' ? 'Hủy' : 'Cancel'}</Button>
        <Button size="sm" onClick={() => { if (name.trim()) { onAdd({ en: name, vi: name }, icon); onClose(); } }}>
          {lang === 'vi' ? 'Thêm' : 'Add'}
        </Button>
      </div>
    </motion.div>
  );
}
