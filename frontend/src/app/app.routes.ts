import { Routes } from '@angular/router';
import { roleGuard } from './guards/role.guard';
import { DemandasComponent } from './pages/demandas/demandas.component';
import { DemandaDetalhesComponent } from './pages/demanda-detalhes/demanda-detalhes.component';
import { NovaDemandaComponent } from './pages/nova-demanda/nova-demanda.component';
import { DependenciasComponent } from './pages/dependencias/dependencias.component';
import { PriorizacoesComponent } from './pages/priorizacoes/priorizacoes.component';
import { MacroBacklogsComponent } from './pages/macro-backlogs/macro-backlogs.component';
import { CadastroUsuariosComponent } from './pages/cadastro-usuarios/cadastro-usuarios.component';

export const routes: Routes = [
  { path: '', component: DemandasComponent },
  { path: 'demandas/:id', component: DemandaDetalhesComponent },
  { path: 'nova-demanda', component: NovaDemandaComponent },
  { path: 'dependencias', component: DependenciasComponent },
  {
    path: 'priorizacoes',
    component: PriorizacoesComponent,
    canActivate: [roleGuard],
    data: { roles: ['diretor', 'admin'] }
  },
  {
    path: 'macro-backlogs',
    component: MacroBacklogsComponent,
    canActivate: [roleGuard],
    data: { roles: ['diretor', 'admin'] }
  },
  {
    path: 'usuarios',
    component: CadastroUsuariosComponent,
    canActivate: [roleGuard],
    data: { roles: ['admin'] }
  },
];
