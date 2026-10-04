import React from 'react';
import gitofyIcon from '../assets/gitofy_icon.png';

export interface SplashScreenProps {
  /** When true the splash fades out so the app can appear smoothly underneath. */
  exiting?: boolean;
}

/**
 * Minimal startup splash.
 *
 * It deliberately carries NO onboarding elements — no page-indicator dots, no
 * carousel artwork, no floating shapes. It is just the app mark on the black
 * canvas (matching the native Android splash), so the ONLY onboarding the user
 * ever sees is the real five-page `OnboardingScreen`. Previously this screen had
 * its own dots and illustrations and read as a second onboarding.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({ exiting = false }) => {
  return (
    <div
      className={`gitofy-splash${exiting ? ' gitofy-splash-exit' : ''}`}
      role="status"
      aria-label="Gitofy loading"
    >
      <div className="gitofy-splash-min">
        <div className="gitofy-splash-mark">
          <img src={gitofyIcon} alt="Gitofy" />
        </div>
        <span className="gitofy-splash-name">Gitofy</span>
        <span className="gitofy-splash-tag">Fast, smooth GitHub management.</span>
      </div>
    </div>
  );
};
