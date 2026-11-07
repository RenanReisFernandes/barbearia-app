# Sistema Web de Agendamento de Serviços em Barbearias

Projeto Integrador — **Primeira Etapa: Planejamento da Aplicação** implementado de forma funcional.

## Requisitos Atendidos

| RF | Descrição | Status |
|----|-----------|--------|
| **RF01** | Cadastro e Autenticação de Usuários (nome, e-mail, telefone, senha) | ✅ |
| **RF02** | Visualização de Agenda em Tempo Real (calendário dinâmico, apenas dias úteis e horários livres) | ✅ |
| **RF03** | Agendamento de Serviços (selecionar serviço + horário disponível + confirmar) | ✅ |
| **RF04** | Gerenciamento de Agendamentos do Cliente (listar próximos + cancelar com antecedência mínima de 2h) | ✅ |
| **RF05** | Painel do Administrador (agenda do dia, bloquear horários, histórico de clientes) | ✅ |

## Tecnologias

- **Frontend:** HTML5, CSS3 (responsivo), JavaScript vanilla
- **Backend:** Node.js puro (módulo `http` nativo — zero dependências externas)
- **Banco de dados:** Em memória (arrays/objetos JavaScript). Os dados são perdidos ao reiniciar o servidor (ideal para testes acadêmicos)

## Como executar

```bash
cd backend
node server.js
```

Abra no navegador: **http://localhost:3000**

### Contas de demonstração

| Perfil  | E-mail                 | Senha      |
|---------|------------------------|------------|
| Admin   | admin@barbearia.com    | admin123   |
| Cliente | cliente@email.com      | cliente123 |

Você também pode criar uma nova conta de cliente pela tela de cadastro.

## Funcionalidades principais

### Cliente
1. Cadastrar-se / fazer login
2. Escolher serviço (Corte, Barba, Combo, Sobrancelha)
3. Selecionar data (seg–sáb) e ver horários livres em tempo real
4. Confirmar agendamento
5. Ver “Meus Agendamentos” e cancelar (mínimo 2 horas de antecedência)

### Administrador (Barbeiro)
1. Visualizar todos os agendamentos de um dia
2. Bloquear / desbloquear horários (manutenção ou descanso)
3. Ver lista de clientes com estatísticas
4. Histórico completo de agendamentos
5. Cancelar agendamentos se necessário

## Estrutura do projeto

```
barbearia-app/
├── backend/
│   ├── server.js          # API REST + servidor estático
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
└── README.md
```

## Regras de negócio implementadas

- Funcionamento: **segunda a sábado**, das **09:00 às 18:00**
- Intervalos de **30 minutos**
- Cancelamento pelo cliente só é permitido com **≥ 2 horas** de antecedência
- Não é possível agendar em horário já ocupado ou bloqueado
- Não é possível agendar no passado
- Um e-mail só pode ser cadastrado uma vez
