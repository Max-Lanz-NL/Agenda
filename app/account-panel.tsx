'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CloudCheck, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { cloud } from '../lib/proposals';
import { workspace } from '../lib/workspace';
import type { useWorkspace } from './use-workspace';

type Mode = 'login' | 'register' | 'reset';

function authMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === 'invalid_credentials') return 'Het e-mailadres of wachtwoord klopt niet.';
  if (code === 'email_not_confirmed') return 'Bevestig eerst je e-mailadres via de link in je e-mail.';
  if (code === 'same_password') return 'Kies een ander wachtwoord dan je huidige wachtwoord.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Je hebt het te vaak geprobeerd. Wacht even en probeer opnieuw.';
  if (code === 'weak_password') return 'Dit wachtwoord voldoet niet aan de vereisten. Kies een langer, sterker wachtwoord.';
  return error instanceof Error ? error.message : 'Dit is niet gelukt. Probeer opnieuw.';
}

export function AccountPanel({ sync }: { sync: ReturnType<typeof useWorkspace> }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [mustSignOut, setMustSignOut] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordForm = sync.recovering || changingPassword;
  const canSignOut = sync.status === 'saved';

  useEffect(() => {
    setPassword('');
    setConfirmation('');
    setCurrentPassword('');
    setChangingPassword(false);
    setMustSignOut(false);
    setShowPassword(false);
  }, [sync.user?.id]);

  function selectMode(value: Mode) {
    setMode(value);
    setStatus('');
    setPassword('');
    setConfirmation('');
    setShowPassword(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cloud || busy) return;
    if (mode === 'register' && password !== confirmation) { setStatus('De wachtwoorden komen niet overeen.'); return; }
    setBusy(true);
    setStatus('');
    try {
      if (mode === 'reset') {
        const { error } = await cloud.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/?account=recovery' });
        if (error) throw error;
        setStatus('Als er een account met dit e-mailadres bestaat, ontvang je een link om je wachtwoord opnieuw in te stellen.');
      } else if (mode === 'register') {
        const { data, error } = await cloud.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin + '/?account=1' } });
        if (error) throw error;
        setPassword('');
        setConfirmation('');
        setStatus(data.session ? 'Je account is aangemaakt. Je bent ingelogd.' : 'Controleer je e-mail om je account te bevestigen. Daarna kun je inloggen.');
      } else {
        const { error } = await cloud.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setPassword('');
        setStatus('Je bent ingelogd. Je agenda wordt gesynchroniseerd.');
      }
    } catch (error) { setStatus(authMessage(error)); }
    finally { setBusy(false); }
  }

  async function sendLoginLink() {
    if (!cloud || busy) return;
    setBusy(true);
    try {
      const { error } = await cloud.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.origin + '/?account=1' } });
      if (error) throw error;
      setStatus('Controleer je e-mail en open de inloglink op dit apparaat.');
    } catch (error) { setStatus(authMessage(error)); }
    finally { setBusy(false); }
  }

  async function signOutEverywhere() {
    if (!cloud) return;
    setBusy(true);
    try {
      const { error } = await cloud.auth.signOut({ scope: 'global' });
      if (error) throw error;
      setMustSignOut(false);
      setChangingPassword(false);
      setStatus('Je wachtwoord is gewijzigd. Log opnieuw in met je nieuwe wachtwoord.');
    } catch { setStatus('Je wachtwoord is gewijzigd. Het afmelden van je sessies is nog niet gelukt. Probeer hieronder opnieuw.'); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cloud || busy) return;
    if (password !== confirmation) { setStatus('De wachtwoorden komen niet overeen.'); return; }
    if (!sync.recovering && !canSignOut) { setStatus('Synchroniseer eerst je wijzigingen voordat je het wachtwoord wijzigt.'); return; }
    setBusy(true);
    try {
      const { error } = await cloud.auth.updateUser({ password, ...(!sync.recovering ? { currentPassword } : {}) });
      if (error) throw error;
      setPassword('');
      setConfirmation('');
      setCurrentPassword('');
      setMustSignOut(true);
      await signOutEverywhere();
    } catch (error) { setStatus(authMessage(error)); }
    finally { setBusy(false); }
  }

  return <div className="form-grid account-sync">
    {!cloud ? <div className="account-notice"><CloudCheck /><p>Online opslag is nog niet aangesloten. Je agenda wordt op dit apparaat opgeslagen.</p></div> : sync.user ? <>
      <div className="account-identity"><span className="account-symbol"><CloudCheck /></span><div><strong>{sync.user.email}</strong><p>Je blijft ingelogd op dit apparaat.</p></div></div>
      <p role="status">{sync.message}</p>
      <div className="wrap">
        <button className="control" disabled={busy} onClick={() => void sync.retry()}>Nu synchroniseren</button>
        <button className="control" disabled={busy || !canSignOut} onClick={async () => {
          setBusy(true);
          try { const { error } = await cloud.auth.signOut({ scope: 'local' }); if (error) throw error; }
          catch { setStatus('Uitloggen is niet gelukt. Probeer opnieuw.'); }
          finally { setBusy(false); }
        }}>Uitloggen op dit apparaat</button>
      </div>
      {sync.hasLocalData && <div className="account-notice form-grid"><p>Deze browser bevat ook afspraken of taken van vóór het inloggen.</p><button className="control" disabled={busy || mustSignOut} onClick={sync.importLocal}>Lokale agenda toevoegen</button></div>}
      {mustSignOut ? <button className="primary" disabled={busy} onClick={() => void signOutEverywhere()}>Opnieuw afmelden op alle apparaten</button> : passwordForm ? <form className="form-grid password-form" onSubmit={changePassword}>
        <h3>{sync.recovering ? 'Nieuw wachtwoord instellen' : 'Wachtwoord wijzigen'}</h3>
        {!sync.recovering && <label>Huidig wachtwoord<input required type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>}
        <label>Nieuw wachtwoord<input required minLength={6} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>Herhaal nieuw wachtwoord<input required minLength={6} type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <p>Na het wijzigen meld je je op je apparaten opnieuw aan met je nieuwe wachtwoord.</p>
        <div className="wrap"><button className="primary" disabled={busy}>{busy ? 'Opslaan…' : 'Nieuw wachtwoord opslaan'}</button>{!sync.recovering && <button className="control" type="button" onClick={() => { setChangingPassword(false); setPassword(''); setConfirmation(''); setCurrentPassword(''); }}>Annuleren</button>}</div>
      </form> : <button className="text-button password-toggle" onClick={() => { setChangingPassword(true); setStatus(''); }}><LockKeyhole />Wachtwoord wijzigen</button>}
    </> : <div className="auth-card">
      <div className="auth-heading"><span className="account-symbol"><LockKeyhole /></span><div><h3>{mode === 'reset' ? 'Wachtwoord vergeten' : 'Je persoonlijke agenda'}</h3><p>{mode === 'reset' ? 'Ontvang een link om een nieuw wachtwoord te kiezen.' : 'Bewaar je agenda en gebruik hem op al je apparaten.'}</p></div></div>
      {mode !== 'reset' && <div className="auth-tabs" role="group" aria-label="Account"><button type="button" aria-pressed={mode === 'login'} onClick={() => selectMode('login')}>Inloggen</button><button type="button" aria-pressed={mode === 'register'} onClick={() => selectMode('register')}>Account aanmaken</button></div>}
      <form className="form-grid" onSubmit={submit}>
        <label>E-mailadres<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        {mode !== 'reset' && <label>Wachtwoord<div className="password-input"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 6 : undefined} value={password} onChange={event => setPassword(event.target.value)} /><button className="password-visibility" type="button" aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>}
        {mode === 'register' && <label>Herhaal wachtwoord<input type="password" autoComplete="new-password" required minLength={6} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
        {mode !== 'reset' && <p className="auth-session-note">Je blijft ingelogd wanneer je de browser sluit.</p>}
        <button className="primary" disabled={busy}>{busy ? 'Even wachten…' : mode === 'register' ? 'Account aanmaken' : mode === 'reset' ? 'Stuur herstellink' : 'Inloggen'}</button>
      </form>
      <div className="auth-links">{mode === 'reset' ? <button className="text-button" onClick={() => selectMode('login')}>Terug naar inloggen</button> : <>
        <button className="text-button" disabled={busy} onClick={() => selectMode('reset')}>Wachtwoord vergeten?</button>
        <button className="text-button" disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onClick={() => void sendLoginLink()}>Inloggen met e-maillink</button>
      </>}</div>
    </div>}
    {status && <p className="account-feedback" role="status">{status}</p>}
    <h2>Veiligheidskopie</h2>
    <div className="wrap"><button className="control" onClick={sync.exportData}>Agenda exporteren</button>
      <label className="control import-backup">Back-up importeren<input type="file" accept="application/json,.json" disabled={mustSignOut} onChange={async event => {
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
  </div>;
}
