// Estructura de la app con sesión iniciada (ADR 0001): barra lateral en la compu, barra
// inferior con el botón central "+" en el celular, barra superior, avisos y la pantalla actual.

import { useEffect } from 'react';
import type { SessionUser } from '../../data/auth';
import { Icon, type IconName } from '../components/Icon';
import { Panels } from '../panels/Panels';
import { HomeScreen } from '../screens/HomeScreen';
import { MovementsScreen } from '../screens/MovementsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { useData } from './hooks';
import { goTo, openPanel, useRoute } from './navigation';
import { Notices } from './Notices';
import type { Screen } from './route';
import { loadTheme } from './theme';
import { TopBar } from './TopBar';

const NAV: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: 'inicio', label: 'Inicio', icon: 'home' },
  { screen: 'movimientos', label: 'Movimientos', icon: 'list' },
  { screen: 'estadisticas', label: 'Estadísticas', icon: 'chart' },
  { screen: 'ajustes', label: 'Ajustes', icon: 'settings' },
];

function NavLink(props: { screen: Screen; label: string; icon: IconName; className: string }) {
  const { screen, label, icon, className } = props;
  const current = useRoute().screen === screen;
  return (
    <a
      href={`#/${screen}`}
      className={className}
      aria-current={current ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault();
        goTo(screen);
      }}
    >
      <Icon name={icon} size={22} />
      {label}
    </a>
  );
}

function ScreenContent({ screen, user }: { screen: Screen; user: SessionUser }) {
  switch (screen) {
    case 'inicio':
      return <HomeScreen />;
    case 'movimientos':
      return <MovementsScreen />;
    case 'estadisticas':
      return <StatsScreen />;
    case 'ajustes':
      return <SettingsScreen user={user} />;
  }
}

export function Shell({ user }: { user: SessionUser }) {
  const route = useRoute();
  const writesBlocked = useData((s) => s.writesBlocked);
  const title = NAV.find((item) => item.screen === route.screen)?.label ?? 'Inicio';

  useEffect(() => {
    loadTheme(user.uid);
  }, [user.uid]);

  // Al cambiar de pantalla, se vuelve arriba de todo.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.screen]);

  function newTransaction() {
    openPanel({ kind: 'transaction', id: null });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <span className="sidebar-brand">Control de Finanzas</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={writesBlocked}
          onClick={newTransaction}
        >
          <Icon name="plus" size={18} strokeWidth={2.2} />
          Nuevo movimiento
        </button>
        <nav aria-label="Principal" className="sidebar-nav">
          {NAV.map((item) => (
            <NavLink key={item.screen} {...item} className="nav-link" />
          ))}
        </nav>
      </aside>

      <div className="shell-main">
        <TopBar title={title} user={user} />
        <Notices />
        <main className="screen">
          <ScreenContent screen={route.screen} user={user} />
        </main>
      </div>

      <nav aria-label="Principal" className="tabbar">
        {NAV.slice(0, 2).map((item) => (
          <NavLink key={item.screen} {...item} className="tab" />
        ))}
        <button
          type="button"
          className="tab-add"
          aria-label="Nuevo movimiento"
          disabled={writesBlocked}
          onClick={newTransaction}
        >
          <Icon name="plus" size={26} strokeWidth={2.2} />
        </button>
        {NAV.slice(2).map((item) => (
          <NavLink key={item.screen} {...item} className="tab" />
        ))}
      </nav>

      <Panels panel={route.panel} />
    </div>
  );
}
