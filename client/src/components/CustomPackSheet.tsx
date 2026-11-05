import { Download, FolderOpen, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CUSTOM_PACK, parseCustomPackLines } from '@imposter/shared';
import { loadCustomPack, saveCustomPack } from '../lib/storage';
import { useRoom } from '../state/GameProvider';
import { Button, ConfirmButton, Sheet } from './ui';

const EXAMPLE = 'Cookies | Oven\nHot Chocolate | Mug\nGrandma | Hugs';

/**
 * Host-only editor for a custom word pack. Packs are saved in this browser too, so the
 * host can reuse them in future rooms, and can be exported/imported as a .json file.
 */
export function CustomPackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { room, priv, send, toast } = useRoom();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = loadCustomPack();

  // Fill the editor from the room's current pack (or this browser's saved pack) when opened.
  useEffect(() => {
    if (!open) return;
    if (priv.customPackLines?.length) {
      setName(room.customPack?.name ?? '');
      setText(priv.customPackLines.join('\n'));
    } else if (saved) {
      setName(saved.name);
      setText(saved.lines.join('\n'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const lines = text.split(/\r?\n/);
  const count = parseCustomPackLines(lines).length;

  const upload = async (n: string, l: string[]) => {
    setBusy(true);
    const res = await send<{ count: number }>('room:setCustomPack', { name: n, lines: l });
    setBusy(false);
    return res;
  };

  const save = async () => {
    const res = await upload(name, lines);
    if (!res.ok) return;
    saveCustomPack({ name: name.trim() || 'Custom Pack', lines: lines.filter((l) => l.trim()) });
    toast(`Saved ${res.data.count} words. Tick "Custom Pack" in categories to use them.`, 'success');
    onClose();
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ name: name.trim() || 'Custom Pack', words: lines.filter((l) => l.trim()) }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name.trim() || 'imposter-pack').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const raw = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(raw) as { name?: unknown; words?: unknown };
        if (!Array.isArray(data.words)) throw new Error('bad');
        setName(typeof data.name === 'string' ? data.name : file.name.replace(/\.json$/i, ''));
        setText(data.words.filter((w): w is string => typeof w === 'string').join('\n'));
      } else {
        setName(file.name.replace(/\.[^.]+$/, ''));
        setText(raw);
      }
      toast('Pack loaded. Check it, then tap Save.', 'info');
    } catch {
      toast("That file isn't a word pack. Use a .txt (one word per line) or an exported .json.", 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Custom word pack">
      <div className="space-y-4">
        <p className="text-sm text-night-300">
          One word per line. Add <b className="text-snow">| hint</b> after a word to give the Imposters a hint word (e.g. <b className="text-snow">Cookies | Oven</b>).
          Players only see the pack's name and size, never the words.
        </p>
        <label className="block">
          <span className="label">Pack name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, CUSTOM_PACK.MAX_NAME_LENGTH))}
            placeholder="e.g. Inside Jokes"
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-night-800 px-4 font-semibold placeholder:text-night-500 focus:border-gold focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="label">Words</span>
            <span className={`text-xs font-bold ${count >= CUSTOM_PACK.MIN_WORDS ? 'text-elf-light' : 'text-night-400'}`}>
              {count} / {CUSTOM_PACK.MAX_WORDS}
            </span>
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            rows={10}
            spellCheck={false}
            className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-night-800 px-4 py-3 font-mono text-sm leading-relaxed placeholder:text-night-500 focus:border-gold focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
            Import file
          </Button>
          <Button size="sm" variant="outline" icon={<Download size={15} />} onClick={exportFile} disabled={count === 0}>
            Export
          </Button>
          {saved && !priv.customPackLines && (
            <Button
              size="sm"
              variant="outline"
              icon={<FolderOpen size={15} />}
              onClick={() => {
                setName(saved.name);
                setText(saved.lines.join('\n'));
              }}
            >
              My saved pack
            </Button>
          )}
          {room.customPack && (
            <ConfirmButton
              size="sm"
              variant="ghost"
              icon={<Trash2 size={15} />}
              confirmLabel="Remove it?"
              onConfirm={async () => {
                const res = await upload('', []);
                if (res.ok) {
                  setText('');
                  setName('');
                  toast('Custom pack removed from this room.', 'info');
                }
              }}
            >
              Remove pack
            </ConfirmButton>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.json,text/plain,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = '';
          }}
        />
        <Button block size="lg" variant="elf" icon={<Save size={18} />} loading={busy} disabled={count < CUSTOM_PACK.MIN_WORDS} onClick={save}>
          {count < CUSTOM_PACK.MIN_WORDS ? `Add at least ${CUSTOM_PACK.MIN_WORDS} words` : `Save ${count} words`}
        </Button>
      </div>
    </Sheet>
  );
}
