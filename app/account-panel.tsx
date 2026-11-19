'use client';

import { useState } from 'react';
import { cloud } from '../lib/proposals';
import { workspace } from '../lib/workspace';
import type { useWorkspace } from './use-workspace';

export function AccountPanel({ sync }: { sync: ReturnType<typeof useWorkspace> }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="form-grid account-sync">
    {!cloud ? <p>Online opslag is nog niet aangesloten. Je agenda wordt op dit apparaat opgeslagen.</p> : sync.user ? <>
      <p>Ingelogd als {sync.user.email}. Log op je andere apparaten in met ditzelfde e-mailadres.</p>
      <p role="status">{sync.message}</p>
      <div className="wrap">
        <button className="control" onClick={() => void sync.retry()}>Nu synchroniseren</button>
        <button className="control" disabled={busy || sync.status === 'saving' || sync.status === 'loading' || sync.status === 'conflict'} onClick={async () => {
          if (sync.status !== 'saved') { setStatus('Synchroniseer of exporteer eerst je wijzigingen voordat je uitlogt.'); return; }
          setBusy(true);
          try { const { error } = await cloud.auth.signOut({ scope: 'local' }); if (error) throw error; }
          catch { setStatus('Uitloggen is niet gelukt. Probeer opnieuw.'); }
          finally { setBusy(false); }
        }}>Uitloggen op dit apparaat</button>
      </div>
      {sync.hasLocalData && <div className="form-grid">
        <p>Deze browser bevat ook afspraken of taken van vóór het inloggen. Je kunt ze aan je account toevoegen.</p>
        <button className="control" onClick={sync.importLocal}>Lokale agenda toevoegen</button>
      </div>}
    </> : <form className="form-grid" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        const { error } = await cloud.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.origin + '/?account=1' } });
        if (error) throw error;
        setStatus('Controleer je e-mail en open de inloglink op dit apparaat.');
      } catch (error) { setStatus(error instanceof Error ? error.message : 'De inloglink kon niet worden verstuurd.'); }
      finally { setBusy(false); }
    }}>
      <p>Log in om je afspraken, geïmporteerde lessen, taken en instellingen automatisch op al je apparaten te bewaren.</p>
      <label>E-mailadres<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <button className="primary" disabled={busy}>{busy ? 'Versturen…' : 'Stuur een inloglink'}</button>
    </form>}
    <h2>Veiligheidskopie</h2>
    <div className="wrap"><button className="control" onClick={sync.exportData}>Agenda exporteren</button>
      <label className="control import-backup">Back-up importeren<input type="file" accept="application/json,.json" onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
          if (file.size > 5 * 1024 * 1024) throw new Error('De back-up is groter dan 5 MB.');
          const data = workspace(JSON.parse(await file.text()));
          if (!window.confirm('De huidige agenda vervangen door deze back-up? Exporteer de huidige agenda eerst als je die wilt bewaren.')) return;
          sync.restore(data);
          setStatus('Back-up ingelezen.');
        } catch (error) { setStatus(error instanceof Error ? error.message : 'De back-up kon niet worden gelezen.'); }
      }} /></label>
    </div>
    {status && <p role="status">{status}</p>}
  </div>;
}
