import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { UserContext } from '../App';

const PRIORIDADES = ['crítica', 'alta', 'média', 'baixa'];
const CANAIS_ORIGEM = ['SMAX', 'SEI/CPA', 'E-mail', 'Reunião', 'Teams'];
const DOMINIOS = ['Judicial', 'Administrativo', 'Misto'];

export default function NovaDemanda() {
  const currentUser = useContext(UserContext);
  const navigate = useNavigate();

  const [coordenadorias, setCoordenadorias] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [macroBacklogs, setMacroBacklogs] = useState([]);
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    coordenadoria_id: '',
    macro_backlog_id: '',
    prioridade: '',
    prioridade_solicitada: false,
    aguarda_areas: [],
    canal_origem: '',
    solicitante: '',
    setor_demandante: '',
    responsavel_id: '',
    prazo: '',
    dominio: '',
    previsao_entrega: '',
    justificativa_priorizacao: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/coordenadorias').then(r => setCoordenadorias(r.data)).catch(console.error);
    api.get('/auth/users').then(r => setUsuarios(r.data)).catch(console.error);
  }, []);

  // Carrega os macro_backlogs disponíveis conforme a coordenadoria selecionada
  useEffect(() => {
    if (!form.coordenadoria_id) {
      setMacroBacklogs([]);
      return;
    }
    api
      .get(`/coordenadorias/${form.coordenadoria_id}/macro-backlogs`)
      .then(r => {
        setMacroBacklogs(r.data);
        // Se o macro atualmente selecionado não faz parte da nova coordenadoria, limpa
        setForm(prev => {
          if (prev.macro_backlog_id && !r.data.some(m => String(m.id) === String(prev.macro_backlog_id))) {
            return { ...prev, macro_backlog_id: '' };
          }
          return prev;
        });
      })
      .catch(console.error);
  }, [form.coordenadoria_id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleAreaToggle = (id) => {
    setForm(prev => {
      const already = prev.aguarda_areas.some(a => a.coordenadoria_id === id);
      return {
        ...prev,
        aguarda_areas: already
          ? prev.aguarda_areas.filter(a => a.coordenadoria_id !== id)
          : [...prev.aguarda_areas, { coordenadoria_id: id, detalhes: '' }],
      };
    });
  };

  const handleDependenciaDetalhesChange = (id, detalhes) => {
    setForm(prev => ({
      ...prev,
      aguarda_areas: prev.aguarda_areas.map(area =>
        area.coordenadoria_id === id ? { ...area, detalhes } : area
      ),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/demandas', {
        ...form,
        criador_id: currentUser.id,
        coordenadoria_id: form.coordenadoria_id || null,
      });
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar demanda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nova-demanda-container">
      <div className="form-card">
        <h2 className="form-title">Nova Demanda</h2>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit} className="demanda-form">

          {/* Título */}
          <div className="form-group">
            <label htmlFor="titulo">Título *</label>
            <input
              id="titulo"
              name="titulo"
              type="text"
              required
              placeholder="Descreva brevemente a demanda..."
              value={form.titulo}
              onChange={handleChange}
            />
          </div>

          {/* Descrição */}
          <div className="form-group">
            <label htmlFor="descricao">Descrição</label>
            <textarea
              id="descricao"
              name="descricao"
              rows={4}
              placeholder="Detalhes, contexto, critérios de aceite..."
              value={form.descricao}
              onChange={handleChange}
            />
          </div>

          {/* Linha: Coordenadoria + Macro */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="coordenadoria_id">Área / Coordenadoria *</label>
              <select id="coordenadoria_id" name="coordenadoria_id" required value={form.coordenadoria_id} onChange={handleChange}>
                <option value="">Selecione...</option>
                {coordenadorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="macro_backlog_id">Macro Backlog *</label>
              <select
                id="macro_backlog_id"
                name="macro_backlog_id"
                required
                value={form.macro_backlog_id}
                onChange={handleChange}
                disabled={!form.coordenadoria_id}
              >
                <option value="">
                  {form.coordenadoria_id ? 'Selecione...' : 'Selecione a coordenadoria antes'}
                </option>
                {macroBacklogs.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Prioridade */}
          <div className="form-group">
            <label htmlFor="prioridade">Prioridade *</label>
            <select id="prioridade" name="prioridade" required value={form.prioridade} onChange={handleChange}>
              <option value="">Selecione...</option>
              {PRIORIDADES.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Canal de Origem + Domínio */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="canal_origem">Canal de Origem *</label>
              <select id="canal_origem" name="canal_origem" required value={form.canal_origem} onChange={handleChange}>
                <option value="">Selecione...</option>
                {CANAIS_ORIGEM.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="dominio">Domínio *</label>
              <select id="dominio" name="dominio" required value={form.dominio} onChange={handleChange}>
                <option value="">Selecione...</option>
                {DOMINIOS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Solicitante + Setor Demandante */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="solicitante">Solicitante *</label>
              <input
                id="solicitante"
                name="solicitante"
                type="text"
                required
                placeholder="Nome de quem solicitou..."
                value={form.solicitante}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="setor_demandante">Setor Demandante *</label>
              <input
                id="setor_demandante"
                name="setor_demandante"
                type="text"
                required
                placeholder="Setor / área de origem..."
                value={form.setor_demandante}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Responsável */}
          <div className="form-group">
            <label htmlFor="responsavel_id">Responsável *</label>
            <select id="responsavel_id" name="responsavel_id" required value={form.responsavel_id} onChange={handleChange}>
              <option value="">Selecione...</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>

          {/* Prazo + Previsão de Entrega */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prazo">Prazo *</label>
              <input
                id="prazo"
                name="prazo"
                type="date"
                required
                value={form.prazo}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="previsao_entrega">
                Previsão de Entrega <span className="label-hint">(opcional)</span>
              </label>
              <input
                id="previsao_entrega"
                name="previsao_entrega"
                type="date"
                value={form.previsao_entrega}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Solicitar Priorização */}
          <div className="form-group form-group-checkbox">
            <label className="checkbox-label" htmlFor="prioridade_solicitada">
              <input
                id="prioridade_solicitada"
                name="prioridade_solicitada"
                type="checkbox"
                checked={form.prioridade_solicitada}
                onChange={handleChange}
              />
              <span className="checkbox-text">
                <strong>Solicitar Priorização ao Diretor</strong>
              </span>
            </label>
          </div>

          {/* Justificativa de Priorização (aparece apenas se solicitação marcada) */}
          {form.prioridade_solicitada && (
            <div className="form-group">
              <label htmlFor="justificativa_priorizacao">
                Justificativa da Priorização <span className="label-hint">(opcional)</span>
              </label>
              <textarea
                id="justificativa_priorizacao"
                name="justificativa_priorizacao"
                rows={3}
                placeholder="Descreva o motivo pelo qual esta demanda deve ser priorizada..."
                value={form.justificativa_priorizacao}
                onChange={handleChange}
              />
            </div>
          )}

          {/* Dependências de área */}
          <div className="form-group">
            <label>
              Dependência <span className="label-hint">(selecione as áreas das quais esta demanda depende)</span>
            </label>
            <div className="dependencias-list">
              {coordenadorias.map(c => (
                <div key={c.id} className="dep-item dep-item-details">
                  <label className="dep-check-row">
                    <input
                      type="checkbox"
                      checked={form.aguarda_areas.some(a => a.coordenadoria_id === c.id)}
                      onChange={() => handleAreaToggle(c.id)}
                    />
                    <span>{c.nome}</span>
                  </label>
                  {form.aguarda_areas.some(a => a.coordenadoria_id === c.id) && (
                    <textarea
                      rows={3}
                      placeholder="Detalhe o que esta dependência precisa resolver..."
                      value={form.aguarda_areas.find(a => a.coordenadoria_id === c.id)?.detalhes || ''}
                      onChange={(e) => handleDependenciaDetalhesChange(c.id, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Ações */}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-save" disabled={loading}>
              {loading ? 'Salvando...' : '✓ Salvar Demanda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
