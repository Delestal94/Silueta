import Link from 'next/link';
import { Logo } from './Logo';

/**
 * The foot of the landing page.
 *
 * It carries the two things the site owes somebody: where the data comes from
 * — TheSportsDB's free tier asks for credit, and the ratings are EA's, not
 * ours — and a plain statement that this is a fan project, so nobody reads the
 * club badges as a licence we do not have.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-white/10 pt-10">
      <div className="mx-auto grid w-full max-w-[1700px] gap-8 pb-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo size={72} />
          <p className="mt-3 max-w-xs text-sm leading-snug text-white/45">
            Aparece una silueta y todos pujan sin saber quién es. Gratis, sin cuenta, de 2 a 12
            jugadores.
          </p>
        </div>

        <Column title="El juego">
          <FooterLink href="/">Crear una sala</FooterLink>
          <FooterLink href="/jugadores">Proponer un jugador</FooterLink>
        </Column>

        <Column title="Los datos">
          <li className="text-white/45">
            Valoraciones y estadísticas de{' '}
            <External href="https://www.ea.com/es-es/games/ea-sports-fc">EA Sports FC</External>
          </li>
          <li className="text-white/45">
            Siluetas, escudos y resultados de{' '}
            <External href="https://www.thesportsdb.com">TheSportsDB</External>
          </li>
        </Column>

        <Column title="Qué es esto">
          <li className="text-white/45">
            Un proyecto de fans, sin fines comerciales y sin relación con EA, la AFA ni los clubes.
            Los escudos y las fotos pertenecen a sus dueños.
          </li>
        </Column>
      </div>

      <div className="mx-auto flex w-full max-w-[1700px] flex-wrap items-center justify-between gap-2 border-t border-white/10 py-5 text-xs text-white/30">
        <p>© {year} Silumatch</p>
        <p>Hecho en Argentina 🇦🇷</p>
      </div>
    </footer>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/70">{title}</h3>
      <ul className="space-y-2 text-sm leading-snug">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-white/45 transition hover:text-white">
        {children}
      </Link>
    </li>
  );
}

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      // noreferrer alongside noopener: the target must not be handed a window
      // reference, nor be told which page sent the visitor.
      rel="noopener noreferrer"
      className="text-orange-400/80 underline decoration-orange-400/30 underline-offset-2 transition hover:text-orange-300"
    >
      {children}
    </a>
  );
}
