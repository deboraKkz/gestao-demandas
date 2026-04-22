import React, { useState, useEffect, useContext } from 'react';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors 
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy, 
  useSortable 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../api';
import { UserContext } from '../App';

// Constantes
const PRIORIDADES = ['crítica', 'alta', 'média', 'baixa'];
const STATUS_OPTIONS = ['pendente', 'em andamento', 'concluída', 'cancelada','suspensa'];

// Componente de Item Ordenável
const STATUS_CONCLUIDA = STATUS_OPTIONS[2];

const isCompletedStatus = (status) => status === STATUS_CONCLUIDA;
const isCancelledStatus = (status) => status === 'cancelada';

function SortableDemandCard({ demanda, onPinToggle, isDirector, onStatusChange, onDetails, canDrag = false }) {
  const isCompleted = isCompletedStatus(demanda.status);
  const isCancelled = isCancelledStatus(demanda.status);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: demanda.id,
    disabled: !canDrag
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`demand-card area-card-${demanda.coordenadoria_id} ${demanda.pinned ? 'is-pinned' : ''} ${isCompleted ? 'is-completed' : ''} ${isCancelled ? 'is-cancelled' : ''} ${canDrag ? 'draggable-item' : ''} ${isDragging ? 'is-dragging' : ''}`}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
    >
      <div className="card-header">
        <h3 className="card-title">
          {demanda.pinned && !isCompleted ? <span className="pin-icon">📌</span> : null}
          <span className="demand-id-badge">{demanda.id}</span> {demanda.titulo}
        </h3>
        <div className="card-actions">
          <span className={`badge badge-priority-${demanda.prioridade.toLowerCase().replace('é', 'e')}`}>
            {demanda.prioridade}
          </span>
          <span className={`badge badge-status-${demanda.status.toLowerCase().replace(' ', '-')}`}>
            {demanda.status}
          </span>
        </div>
      </div>
      
      <div className="card-body">
        <p>
          <strong>Área:</strong> {demanda.coordenadoria_nome || 'N/A'} &bull;
          <strong> Macro:</strong> {demanda.macro_backlog_nome || 'N/A'}
        </p>
      </div>

      <div className="card-footer" onPointerDown={(e) => isDirector && demanda.pinned && e.stopPropagation()}>
        <div className="card-footer-meta">
          <span>Criado em {format(new Date(demanda.created_at), 'dd/MM/yyyy')}</span>
          {isCompleted && demanda.concluded_at && (
            <span>Concluída em {format(new Date(demanda.concluded_at), 'dd/MM/yyyy')}</span>
          )}
          {demanda.aguarda_areas_nomes && (
            <span className="dep-badge">aguarda {demanda.aguarda_areas_nomes}</span>
          )}
        </div>
        <div className="card-footer-actions">
           {isDirector ? (
             <>
               {!isCompleted && (
                 <button
                   className={`btn ${demanda.pinned ? 'btn-unpin' : 'btn-pin'}`}
                   onClick={() => onPinToggle(demanda.id)}
                 >
                   {demanda.pinned ? 'Desafixar' : 'Fixar'}
                 </button>
               )}
               <select 
                 className="btn" 
                 value={demanda.status}
                 onChange={(e) => onStatusChange(demanda.id, e.target.value)}
                 style={{ padding: '0.25rem 0.5rem', width: 'auto' }}
               >
                 {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
               </select>
             </>
           ) : (
             <select 
               className="btn" 
               value={demanda.status}
               onChange={(e) => onStatusChange(demanda.id, e.target.value)}
               style={{ padding: '0.25rem 0.5rem', width: 'auto' }}
             >
               {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
           )}
           <button className="btn btn-secondary" onClick={() => onDetails(demanda.id)}>
             Detalhes
           </button>
        </div>
      </div>
    </div>
  );
}

export default function Demandas() {
  const currentUser = useContext(UserContext);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [demandas, setDemandas] = useState([]);
  const [coordenadorias, setCoordenadorias] = useState([]);
  const [macroBacklogs, setMacroBacklogs] = useState([]);

  const EMPTY_FILTERS = { coordenadoria_id: '', macro_backlog_id: '', prioridade: '', status: '', responsavel_id: '' };

  const [filters, setFilters] = useState(() => ({
    coordenadoria_id: searchParams.get('coordenadoria_id') || '',
    macro_backlog_id: searchParams.get('macro_backlog_id') || '',
    prioridade:       searchParams.get('prioridade')       || '',
    status:           searchParams.get('status')           || '',
    responsavel_id:   searchParams.get('responsavel_id')   || '',
  }));
  const [busca, setBusca] = useState(() => searchParams.get('q') || '');

  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadData = async () => {
    setLoading(true);
    try {
      if(coordenadorias.length === 0) {
        const cRes = await api.get('/coordenadorias');
        setCoordenadorias(cRes.data);
      }
      if(macroBacklogs.length === 0) {
        const mbRes = await api.get('/macro-backlogs');
        setMacroBacklogs(mbRes.data);
      }

      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if(value) params.append(key, value);
      });

      const res = await api.get(`/demandas?${params.toString()}`);
      setDemandas(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    if (busca) params.set('q', busca);
    setSearchParams(params, { replace: true });
  }, [filters, busca]);

  useEffect(() => {
    loadData();
  }, [filters]);

  const handlePinToggle = async (id) => {
    try {
      await api.put(`/demandas/${id}/pin`);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenDetails = (id) => {
    navigate(`/demandas/${id}`);
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.put(`/demandas/${id}/status`, { status: newStatus });
      loadData();
    } catch (err) {
      console.error(err);
    }
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pinnedDemandas.findIndex((d) => d.id === active.id);
    const newIndex = pinnedDemandas.findIndex((d) => d.id === over.id);

    const reorderedPinned = arrayMove(pinnedDemandas, oldIndex, newIndex).map((d, i) => ({
      ...d,
      pin_order: i + 1,
    }));

    const orderItems = reorderedPinned.map((d) => ({ id: d.id, pin_order: d.pin_order }));

    try {
      await api.put('/demandas/reorder', { orderItems });
      // Atualiza estado SÓ após a API responder — evita conflito com a animação do DnD Kit
      setDemandas((prev) => {
        const pinnedIds = new Set(reorderedPinned.map((d) => d.id));
        return [...reorderedPinned, ...prev.filter((d) => !pinnedIds.has(d.id))];
      });
    } catch (err) {
      console.error('Erro ao reordenar', err);
      loadData();
    }
  };

  // Filtra por busca (ID exato ou nome parcial, case-insensitive)
  const demandasFiltradas = busca.trim()
    ? demandas.filter(d =>
        String(d.id) === busca.trim() ||
        d.titulo.toLowerCase().includes(busca.trim().toLowerCase())
      )
    : demandas;

  // Separa e agrupa
  const activeDemandas = demandasFiltradas.filter(d => !isCompletedStatus(d.status) && !isCancelledStatus(d.status));
  const completedDemandas = demandasFiltradas
    .filter(d => isCompletedStatus(d.status) || isCancelledStatus(d.status))
    .sort((a, b) => new Date(b.concluded_at || b.created_at) - new Date(a.concluded_at || a.created_at));
  const pinnedDemandas = activeDemandas.filter(d => d.pinned);
  const unpinnedDemandas = activeDemandas.filter(d => !d.pinned);
  const isDirector = currentUser?.role === 'diretor';

  return (
    <div>
      <div className="filters-bar">
        <button
          className={`btn${filters.responsavel_id ? ' btn-active' : ' btn-secondary'}`}
          onClick={() => setFilters(prev => ({
            ...prev,
            responsavel_id: prev.responsavel_id ? '' : currentUser?.id
          }))}
        >
          {filters.responsavel_id ? '✓ Minhas Demandas' : 'Minhas Demandas'}
        </button>
        <select 
          value={filters.coordenadoria_id} 
          onChange={e => setFilters({...filters, coordenadoria_id: e.target.value})}
        >
          <option value="">Todas Coordenadorias</option>
          {coordenadorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        
        <select
          value={filters.macro_backlog_id}
          onChange={e => setFilters({...filters, macro_backlog_id: e.target.value})}
        >
          <option value="">Todos os Macros</option>
          {macroBacklogs.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>

        <select 
          value={filters.prioridade} 
          onChange={e => setFilters({...filters, prioridade: e.target.value})}
        >
          <option value="">Todas Prioridades</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>

        <select
          value={filters.status}
          onChange={e => setFilters({...filters, status: e.target.value})}
        >
          <option value="">Todos Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <input
          type="text"
          placeholder="Buscar por ID ou nome..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />

        {(Object.values(filters).some(v => v !== '') || busca) && (
          <button className="btn btn-secondary" onClick={() => { setFilters(EMPTY_FILTERS); setBusca(''); }}>
            ✕ Limpar Filtros
          </button>
        )}
      </div>

      {loading ? (
        <p>Carregando demandas...</p>
      ) : (
        <div className="demand-list">
          {pinnedDemandas.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={pinnedDemandas.map(d => d.id)} strategy={verticalListSortingStrategy}>
                <div style={{ marginBottom: '1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '1rem' }}>
                  <h3 className="accent-section-heading">📌 Priorizadas</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {pinnedDemandas.map(d => (
                      <SortableDemandCard 
                        key={d.id} 
                        demanda={d} 
                        isDirector={isDirector}
                        canDrag={isDirector}
                        onPinToggle={handlePinToggle}
                        onStatusChange={handleStatusChange}
                        onDetails={handleOpenDetails}
                      />
                    ))}
                  </div>
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             {unpinnedDemandas.map(d => (
                <SortableDemandCard 
                  key={d.id} 
                  demanda={d} 
                  isDirector={isDirector}
                  onPinToggle={handlePinToggle}
                  onStatusChange={handleStatusChange}
                  onDetails={handleOpenDetails}
                />
             ))}
             {completedDemandas.map(d => (
                <SortableDemandCard 
                  key={d.id} 
                  demanda={d} 
                  isDirector={isDirector}
                  onPinToggle={handlePinToggle}
                  onStatusChange={handleStatusChange}
                  onDetails={handleOpenDetails}
                />
             ))}
             {demandasFiltradas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhuma demanda encontrada.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
