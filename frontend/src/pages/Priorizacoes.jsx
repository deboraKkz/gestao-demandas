import React, { useState, useEffect, useContext } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { UserContext } from '../App';

export default function Priorizacoes() {
  const currentUser = useContext(UserContext);
  const navigate = useNavigate();
  const [demandas, setDemandas] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/priorizacoes');
      setDemandas(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDecision = async (id, decisao) => {
    try {
      await api.post(`/priorizacoes/${id}/decisao`, {
        diretor_id: currentUser.id,
        decisao
      });
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p>Carregando pedidos...</p>;

  return (
    <div>
      <h2 className="accent-page-heading" style={{ marginBottom: '2rem' }}>Pedidos de Priorização</h2>
      <div className="demand-list">
        {demandas.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Nenhum pedido pendente.</p>
        ) : (
          demandas.map(d => (
            <div key={d.id} className={`demand-card area-card-${d.coordenadoria_id}`}>
              <div className="card-header">
                <h3 className="card-title">
                  <span className="demand-id-badge">{d.id}</span> {d.titulo}
                </h3>
              </div>
              <div className="card-body">
                <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  {d.coordenadoria_nome || 'N/A'}
                </p>
                {d.justificativa_priorizacao && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.6rem 0.85rem',
                    background: 'rgba(234, 179, 8, 0.08)',
                    borderLeft: '3px solid var(--warning)',
                    borderRadius: '0 4px 4px 0',
                  }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600, marginBottom: '0.2rem' }}>
                      Justificativa
                    </p>
                    <p style={{ fontSize: '0.85rem', margin: 0 }}>{d.justificativa_priorizacao}</p>
                  </div>
                )}
                <p style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
                  <strong>Solicitante:</strong> {d.solicitante || d.criador_nome || 'N/A'}
                  {d.setor_demandante && <> &bull; <strong>Setor Solicitante:</strong> {d.setor_demandante}</>}
                </p>
                <p style={{ fontSize: '0.8rem' }}>
                  <strong>Pedido em:</strong>{' '}
                  {d.priorizacao_solicitada_em
                    ? format(new Date(d.priorizacao_solicitada_em), 'dd/MM/yyyy HH:mm')
                    : format(new Date(d.created_at), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
              <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button className="btn btn-secondary" onClick={() => navigate(`/demandas/${d.id}`)}>
                  Detalhes
                </button>
                <button className="btn" onClick={() => handleDecision(d.id, 'rejeitado')}>
                  Rejeitar
                </button>
                <button className="btn btn-success" onClick={() => handleDecision(d.id, 'aprovado')}>
                  Aprovar (Fixar)
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
