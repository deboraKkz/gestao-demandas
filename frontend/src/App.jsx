import React, { useState, useEffect, useRef, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import api from './api';
import Demandas from './pages/Demandas';
import Dependencias from './pages/Dependencias';
import Priorizacoes from './pages/Priorizacoes';
import NovaDemanda from './pages/NovaDemanda';
import DemandaDetalhes from './pages/DemandaDetalhes';
import MacroBacklogs from './pages/MacroBacklogs';

export const UserContext = createContext(null);

function Header({ users, currentUser, setCurrentUser, theme, setTheme }) {
  const location = useLocation();
  const isLight = theme === 'light';
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickFora(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAberto(false);
      }
    }
    if (menuAberto) document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [menuAberto]);

  const podeVerMenuAdmin = ['diretor', 'admin'].includes(currentUser?.role);

  return (
    <header>
      <div className="logo">Gestão de Demandas</div>
      <nav className="main-nav">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Demandas</Link>
        <Link to="/dependencias" className={location.pathname === '/dependencias' ? 'active' : ''}>Dependências</Link>
        <Link to="/nova-demanda" className={location.pathname === '/nova-demanda' ? 'active' : ''}>+ Nova Demanda</Link>
        {['diretor', 'admin'].includes(currentUser?.role) && (
          <Link to="/priorizacoes" className={location.pathname === '/priorizacoes' ? 'active' : ''}>Pedidos de Priorização</Link>
        )}
      </nav>
      <div className="user-selector">
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme(isLight ? 'dark' : 'light')}
          aria-label={isLight ? 'Ativar modo escuro' : 'Ativar modo claro'}
          title={isLight ? 'Modo escuro' : 'Modo claro'}
        >
          {isLight ? '☾' : '☀'}
        </button>
        <span>Mock Login:</span>
        <select
          value={currentUser?.id || ''}
          onChange={(e) => setCurrentUser(users.find(u => u.id === parseInt(e.target.value)))}
        >
          <option value="">Selecione um usuário...</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.nome} ({u.role}{u.coordenadoria_nome ? ` - ${u.coordenadoria_nome}` : ''})
            </option>
          ))}
        </select>
        {podeVerMenuAdmin && (
          <div className="header-menu" ref={menuRef}>
            <button
              type="button"
              className={`hamburger-btn${menuAberto ? ' aberto' : ''}`}
              onClick={() => setMenuAberto(v => !v)}
              aria-label="Menu de administração"
              aria-expanded={menuAberto}
            >
              <span />
              <span />
              <span />
            </button>
            {menuAberto && (
              <div className="header-dropdown">
                <Link
                  to="/macro-backlogs"
                  className={`header-dropdown-item${location.pathname === '/macro-backlogs' ? ' ativo' : ''}`}
                  onClick={() => setMenuAberto(false)}
                >
                  Macro Backlogs
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function App() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    // Load mock users
    api.get('/auth/users').then(res => {
      setUsers(res.data);
      if (res.data.length > 0) {
        setCurrentUser(res.data[0]); // Seleciona o primeiro por padrão
      }
    }).catch(err => console.error("Failed to load users", err));
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <UserContext.Provider value={currentUser}>
      <Router>
        <div className={`app-container theme-${theme}`}>
          <Header users={users} currentUser={currentUser} setCurrentUser={setCurrentUser} theme={theme} setTheme={setTheme} />
          <main>
            {currentUser ? (
              <Routes>
                <Route path="/" element={<Demandas />} />
                <Route path="/demandas/:id" element={<DemandaDetalhes />} />
                <Route path="/dependencias" element={<Dependencias />} />
                <Route path="/nova-demanda" element={<NovaDemanda />} />
                <Route path="/priorizacoes" element={['diretor', 'admin'].includes(currentUser.role) ? <Priorizacoes /> : <div style={{textAlign: 'center', marginTop: '50px'}}>Acesso restrito a Diretores.</div>} />
                <Route path="/macro-backlogs" element={['diretor', 'admin'].includes(currentUser.role) ? <MacroBacklogs /> : <div style={{textAlign: 'center', marginTop: '50px'}}>Acesso restrito a Diretores e Administradores.</div>} />
              </Routes>
            ) : (
              <div style={{textAlign: 'center', marginTop: '50px'}}>
                <h2>Bem-vindo!</h2>
                <p>Por favor, selecione um usuário no topo direito para continuar.</p>
              </div>
            )}
          </main>
        </div>
      </Router>
    </UserContext.Provider>
  );
}

export default App;
