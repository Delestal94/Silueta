'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { POSITION_LABELS_ES, POSITION_TYPES } from '@/lib/game/submissions';
import { Toasts, useToasts } from '@/components/Toasts';

type Tab = 'nuevo' | 'corregir' | 'revisar';

interface FoundPlayer {
  id: string;
  name: string;
  position_type: string;
  nationality: string | null;
  team: string | null;
  birth_date: string | null;
  ea_overall: number | null;
  gender: string | null;
}

export default function PlayersPage() {
  const [tab, setTab] = useState<Tab>('nuevo');
  const { toasts, push } = useToasts();

  return (
    <main className="min-h-screen px-4 py-8">
      <Toasts toasts={toasts} />

      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-lime-300/70">Comunidad</p>
          <h1 className="mt-2 text-4xl font-black">Jugadores</h1>
          <p className="mt-3 text-sm text-white/55">
            Proponé un jugador que falte o corregí datos de uno existente. Las propuestas
            pasan por revisión antes de entrar al catálogo.
          </p>
        </div>

        <div className="panel mb-5 flex gap-1 p-1">
          {(
            [
              ['nuevo', 'Proponer jugador'],
              ['corregir', 'Corregir datos'],
              ['revisar', 'Revisar'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === id ? 'bg-lime-300 text-emerald-950' : 'text-white/60 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'nuevo' && <NewPlayerForm push={push} />}
        {tab === 'corregir' && <EditPlayerForm push={push} />}
        {tab === 'revisar' && <ReviewQueue push={push} />}

        <div className="mt-8 text-center">
          <Link href="/" className="btn-ghost">
            Volver al juego
          </Link>
        </div>
      </div>
    </main>
  );
}

type Push = (message: string, tone?: 'error' | 'success' | 'info') => void;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-white/35">{hint}</span>}
    </label>
  );
}

function NewPlayerForm({ push }: { push: Push }) {
  const [form, setForm] = useState({
    name: '',
    positionType: 'forward',
    gender: 'men',
    nationality: '',
    team: '',
    birthDate: '',
    rating: 80,
    imageUrl: '',
    imageIsTransparent: false,
    submittedBy: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'new', data: { ...form, rating: Number(form.rating) } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Faltan datos o hay algo inválido');

      push('Propuesta enviada. Queda a la espera de revisión.', 'success');
      set({ name: '', nationality: '', team: '', birthDate: '', imageUrl: '', imageIsTransparent: false });
    } catch (err) {
      push(err instanceof Error ? err.message : 'No se pudo enviar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel animate-rise space-y-4 p-6">
      <Field label="Nombre completo">
        <input
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Ej: Diego Maradona"
          className="field"
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Puesto">
          <select
            value={form.positionType}
            onChange={(e) => set({ positionType: e.target.value })}
            className="field"
          >
            {POSITION_TYPES.map((p) => (
              <option key={p} value={p} className="bg-emerald-950">
                {POSITION_LABELS_ES[p]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Categoría">
          <select
            value={form.gender}
            onChange={(e) => set({ gender: e.target.value })}
            className="field"
          >
            <option value="men" className="bg-emerald-950">
              Masculino
            </option>
            <option value="women" className="bg-emerald-950">
              Femenino
            </option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nacionalidad">
          <input
            value={form.nationality}
            onChange={(e) => set({ nationality: e.target.value })}
            placeholder="Argentina"
            className="field"
            required
          />
        </Field>

        <Field label="Club">
          <input
            value={form.team}
            onChange={(e) => set({ team: e.target.value })}
            placeholder="Napoli"
            className="field"
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de nacimiento">
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => set({ birthDate: e.target.value })}
            className="field"
            required
          />
        </Field>

        <Field label="Rating en su mejor momento" hint="Entre 40 y 99, escala tipo FIFA">
          <input
            type="number"
            min={40}
            max={99}
            value={form.rating}
            onChange={(e) => set({ rating: Number(e.target.value) })}
            className="field"
            required
          />
        </Field>
      </div>

      <Field
        label="URL de la imagen"
        hint="Tiene que ser un PNG con fondo transparente y de cuerpo entero: de ahí sale la silueta."
      >
        <input
          type="url"
          value={form.imageUrl}
          onChange={(e) => set({ imageUrl: e.target.value })}
          placeholder="https://…/jugador.png"
          className="field"
          required
        />
      </Field>

      <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-black/25 p-3">
        <input
          type="checkbox"
          checked={form.imageIsTransparent}
          onChange={(e) => set({ imageIsTransparent: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-lime-400"
        />
        <span className="text-sm text-white/70">
          Confirmo que la imagen tiene <strong>fondo transparente</strong>. Una foto normal
          da una silueta rectangular que no sirve para jugar.
        </span>
      </label>

      <Field label="Tu nombre">
        <input
          value={form.submittedBy}
          onChange={(e) => set({ submittedBy: e.target.value })}
          placeholder="Para saber quién lo propuso"
          className="field"
          required
        />
      </Field>

      <button type="submit" disabled={saving} className="btn-primary w-full py-3">
        {saving ? 'Enviando…' : 'Enviar propuesta'}
      </button>
    </form>
  );
}

function EditPlayerForm({ push }: { push: Push }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundPlayer[]>([]);
  const [picked, setPicked] = useState<FoundPlayer | null>(null);
  const [patch, setPatch] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [submittedBy, setSubmittedBy] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) setResults((await res.json()).players ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    setSaving(true);

    try {
      const data: Record<string, unknown> = {
        targetPlayerId: picked.id,
        reason,
        submittedBy,
      };
      if (patch.positionType) data.positionType = patch.positionType;
      if (patch.nationality) data.nationality = patch.nationality;
      if (patch.team) data.team = patch.team;
      if (patch.birthDate) data.birthDate = patch.birthDate;
      if (patch.rating) data.rating = Number(patch.rating);

      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'edit', data }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Revisá los campos');

      push('Corrección enviada para revisión.', 'success');
      setPicked(null);
      setPatch({});
      setReason('');
      setQuery('');
    } catch (err) {
      push(err instanceof Error ? err.message : 'No se pudo enviar', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!picked) {
    return (
      <div className="panel animate-rise space-y-4 p-6">
        <Field label="Buscá el jugador" hint="Mínimo 3 letras">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej: Messi"
            className="field"
            autoFocus
          />
        </Field>

        <ul className="space-y-2">
          {results.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setPicked(p)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left hover:bg-white/[0.07]"
              >
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-xs text-white/45">
                  {POSITION_LABELS_ES[p.position_type as keyof typeof POSITION_LABELS_ES] ??
                    p.position_type}
                  {p.team ? ` · ${p.team}` : ''}
                  {p.nationality ? ` · ${p.nationality}` : ''}
                </span>
              </button>
            </li>
          ))}
          {query.trim().length >= 3 && !results.length && (
            <li className="px-1 text-sm text-white/40">Sin resultados.</li>
          )}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel animate-rise space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/45">Corrigiendo</p>
          <p className="text-lg font-bold">{picked.name}</p>
        </div>
        <button type="button" onClick={() => setPicked(null)} className="btn-ghost px-3 py-1.5 text-sm">
          Cambiar
        </button>
      </div>

      <p className="text-xs text-white/45">
        Completá sólo lo que haya que corregir. Lo que dejes vacío queda como está.
      </p>

      <Field label={`Puesto — ahora: ${POSITION_LABELS_ES[picked.position_type as keyof typeof POSITION_LABELS_ES] ?? picked.position_type}`}>
        <select
          value={patch.positionType ?? ''}
          onChange={(e) => setPatch({ ...patch, positionType: e.target.value })}
          className="field"
        >
          <option value="" className="bg-emerald-950">
            Sin cambios
          </option>
          {POSITION_TYPES.map((p) => (
            <option key={p} value={p} className="bg-emerald-950">
              {POSITION_LABELS_ES[p]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Nacionalidad — ${picked.nationality ?? 'sin dato'}`}>
          <input
            value={patch.nationality ?? ''}
            onChange={(e) => setPatch({ ...patch, nationality: e.target.value })}
            placeholder="Sin cambios"
            className="field"
          />
        </Field>
        <Field label={`Club — ${picked.team ?? 'sin dato'}`}>
          <input
            value={patch.team ?? ''}
            onChange={(e) => setPatch({ ...patch, team: e.target.value })}
            placeholder="Sin cambios"
            className="field"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Nacimiento — ${picked.birth_date ?? 'sin dato'}`}>
          <input
            type="date"
            value={patch.birthDate ?? ''}
            onChange={(e) => setPatch({ ...patch, birthDate: e.target.value })}
            className="field"
          />
        </Field>
        <Field label={`Rating — ${picked.ea_overall ?? 'sin dato'}`}>
          <input
            type="number"
            min={40}
            max={99}
            value={patch.rating ?? ''}
            onChange={(e) => setPatch({ ...patch, rating: e.target.value })}
            placeholder="Sin cambios"
            className="field"
          />
        </Field>
      </div>

      <Field label="Por qué" hint="Ayuda a quien revisa a decidir rápido">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Está como defensa pero jugaba de mediocampista"
          className="field resize-none"
          required
        />
      </Field>

      <Field label="Tu nombre">
        <input
          value={submittedBy}
          onChange={(e) => setSubmittedBy(e.target.value)}
          className="field"
          required
        />
      </Field>

      <button type="submit" disabled={saving} className="btn-primary w-full py-3">
        {saving ? 'Enviando…' : 'Enviar corrección'}
      </button>
    </form>
  );
}

interface Submission {
  id: string;
  kind: 'new' | 'edit';
  submitted_by: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  current: FoundPlayer | null;
}

function ReviewQueue({ push }: { push: Push }) {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (withToken: string) => {
      const res = await fetch('/api/submissions', { headers: { 'x-admin-token': withToken } });
      if (res.status === 401) {
        push('Clave de moderación incorrecta', 'error');
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        push('No se pudo leer la cola', 'error');
        return;
      }
      setItems((await res.json()).submissions ?? []);
      setAuthed(true);
      sessionStorage.setItem('admin_token', withToken);
    },
    [push]
  );

  useEffect(() => {
    const saved = sessionStorage.getItem('admin_token');
    if (saved) {
      setToken(saved);
      load(saved);
    }
  }, [load]);

  const review = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/submissions/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo revisar');

      push(
        decision === 'reject'
          ? 'Rechazada'
          : data.needsImage
            ? 'Aprobada. Falta generar la silueta con "npm run submissions".'
            : 'Aprobada y aplicada',
        'success'
      );
      setItems((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      push(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!authed) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(token);
        }}
        className="panel animate-rise space-y-4 p-6"
      >
        <Field label="Clave de moderación" hint="Sólo para quien administra el catálogo">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="field"
            autoFocus
          />
        </Field>
        <button type="submit" className="btn-primary w-full py-3">
          Entrar
        </button>
      </form>
    );
  }

  if (!items.length) {
    return (
      <div className="panel animate-rise p-8 text-center text-white/50">
        No hay propuestas pendientes.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((s) => (
        <div key={s.id} className="panel animate-rise p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="chip mb-2">{s.kind === 'new' ? 'Alta' : 'Corrección'}</span>
              <p className="truncate text-lg font-bold">
                {s.kind === 'new' ? String(s.payload.name ?? '—') : (s.current?.name ?? '—')}
              </p>
              <p className="text-xs text-white/45">
                propuesto por {s.submitted_by ?? 'anónimo'}
              </p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {Object.entries(s.payload)
              .filter(([k]) => !['submittedBy', 'targetPlayerId', 'imageIsTransparent'].includes(k))
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wider text-white/40">{k}</dt>
                  <dd className="truncate" title={String(v)}>
                    {String(v)}
                  </dd>
                </div>
              ))}
          </dl>

          {typeof s.payload.imageUrl === 'string' && (
            <a
              href={s.payload.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block text-xs text-lime-300 underline"
            >
              Abrir la imagen propuesta antes de aprobar ↗
            </a>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => review(s.id, 'approve')}
              disabled={busy}
              className="btn-primary flex-1"
            >
              Aprobar
            </button>
            <button
              onClick={() => review(s.id, 'reject')}
              disabled={busy}
              className="btn-ghost flex-1"
            >
              Rechazar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
