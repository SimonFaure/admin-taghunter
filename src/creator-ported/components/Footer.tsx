import { APP_VERSION } from '../constants/version';

export function Footer() {
  return (
    <footer className="bg-slate-800/80 backdrop-blur-sm border-t border-slate-700 py-4">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between text-slate-400 text-sm">
          <div>
            <span>v{APP_VERSION}</span>
          </div>
          <div className="w-16"></div>
        </div>
      </div>
    </footer>
  );
}
