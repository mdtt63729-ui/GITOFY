import React from 'react';
import gitofyIcon from '../assets/gitofy_icon.png';

/**
 * Lightweight first-launch visual splash inspired by the supplied reference video:
 * white canvas, soft cloud base, playful organic floating shapes and a restrained
 * page-indicator motion. No raster/video asset is required, keeping startup fast.
 */
export interface SplashScreenProps {
  /** When true the splash fades out so the app can appear smoothly underneath. */
  exiting?: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ exiting = false }) => {
  return (
    <div
      className={`gitofy-splash${exiting ? ' gitofy-splash-exit' : ''}`}
      role="status"
      aria-label="Gitofy loading"
    >
      <div className="splash-top-dots" aria-hidden="true">
        <span className="active" />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="splash-stage" aria-hidden="true">
        <div className="splash-blob blob-blue"><i /><i /></div>
        <div className="splash-blob blob-orange"><i /><i /></div>
        <div className="splash-blob blob-coral"><i /><i /></div>
        <div className="splash-mini mini-blue" />
        <div className="splash-mini mini-yellow" />
        <div className="splash-mini mini-coral" />
        <div className="splash-phone">
          <div className="splash-phone-screen" />
        </div>
        <span className="splash-particle p1" />
        <span className="splash-particle p2" />
        <span className="splash-particle p3" />
        <span className="splash-particle p4" />
      </div>

      <div className="splash-clouds" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="splash-copy">
        <div className="splash-logo-mark"><img src={gitofyIcon} alt="Gitofy" /></div>
        <h1>Gitofy</h1>
        <p>Fast, smooth GitHub management.</p>
      </div>
    </div>
  );
};
