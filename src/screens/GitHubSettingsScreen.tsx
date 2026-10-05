import React, { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3TextField } from '../ui/m3/M3TextField';
import { M3Switch } from '../ui/m3/M3Switch';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { fetchAuthenticatedUser, updateUserProfile, type GitHubUserProfile } from '../git/githubApi';

interface Props {
  token: string;
  onBack: () => void;
  /** Called after a successful save so the rest of the app can pick up the change. */
  onSaved?: () => void;
}

/**
 * GitHub account settings — the same profile fields GitHub's own
 * Settings → Public profile page edits, backed by PATCH /user.
 */
export const GitHubSettingsScreen: React.FC<Props> = ({ token, onBack, onSaved }) => {
  const { colors, triggerHaptic } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<GitHubUserProfile | null>(null);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [blog, setBlog] = useState('');
  const [twitter, setTwitter] = useState('');
  const [hireable, setHireable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await fetchAuthenticatedUser(token);
      setProfile(p);
      setName(p.name ?? '');
      setBio(p.bio ?? '');
      setCompany(p.company ?? '');
      setLocation(p.location ?? '');
      setBlog(p.blog ?? '');
      setTwitter(p.twitter_username ?? '');
      setHireable(Boolean(p.hireable));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const p = await updateUserProfile(token, {
        name: name.trim() || null,
        bio: bio.trim() || null,
        company: company.trim() || null,
        location: location.trim() || null,
        blog: blog.trim() || null,
        twitter_username: twitter.trim() || null,
        hireable,
      });
      setProfile(p);
      triggerHaptic('success');
      setSaved(true);
      onSaved?.();
      window.setTimeout(() => setSaved(false), 2600);
    } catch (e) {
      triggerHaptic('error');
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black truncate">GitHub account settings</div>
          <div className="text-[10px] opacity-60 truncate">Everything GitHub lets you change, in one place</div>
        </div>
      </div>

      <div className="p-5 pb-28 flex flex-col gap-4">
        {loading ? (
          <SkeletonRows count={6} height={58} />
        ) : (
          <>
            {profile && (
              <div className="p-4 rounded-3xl border flex items-center gap-3" style={card}>
                <img src={profile.avatar_url} alt="" className="w-12 h-12 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black truncate">@{profile.login}</div>
                  <div className="text-[10px] opacity-70">{profile.public_repos} public repos · {profile.followers} followers · {profile.following} following</div>
                </div>
              </div>
            )}

            <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Public profile</span>
              <M3TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              <M3TextField label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short bio" />
              <M3TextField label="Company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="@acme or Acme Inc." />
              <M3TextField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
              <M3TextField label="Website" value={blog} onChange={(e) => setBlog(e.target.value)} placeholder="https://example.com" />
              <M3TextField label="Social account" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="username" />
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="pr-3">
                  <p className="text-xs font-bold">Available for hire</p>
                  <p className="text-[10px] opacity-70">Shown on your GitHub profile.</p>
                </div>
                <M3Switch checked={hireable} onChange={setHireable} />
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.onErrorContainer, borderColor: colors.error }}>{error}</div>
            )}
            {saved && (
              <div className="rounded-2xl border px-3 py-2 text-xs font-semibold animate-fade-in" style={{ backgroundColor: colors.diffAddedContainer, color: colors.diffAdded, borderColor: colors.diffAdded }}>✓ Saved to GitHub</div>
            )}

            <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" loading={saving} onClick={save}>
              Save to GitHub
            </M3Button>

            <p className="text-[10px] opacity-60 text-center leading-relaxed">
              These changes are written straight to your GitHub account with your token — the same fields
              you would edit on github.com/settings/profile.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
