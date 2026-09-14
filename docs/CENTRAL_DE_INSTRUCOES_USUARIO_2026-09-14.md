# Central de Instruções do Usuário — Minhas Finanças RENOVA

Data: 14/09/2026

## Objetivo

Criar um espaço permanente dentro do próprio sistema para ensinar o usuário a navegar, localizar recursos e resolver dúvidas sem depender do suporte para tarefas simples.

## Acesso

Foi adicionado ao menu lateral o item:

**? Instruções**

Ao abrir, o sistema exibe a página **Central de Instruções**.

## Estrutura da central

A central foi organizada em:

1. Primeiros passos;
2. Financeiro;
3. Recebimentos;
4. Planejamento;
5. IA Financeira e assinatura;
6. Problemas comuns;
7. Segurança.

Também existe uma busca por palavras-chave para encontrar rapidamente instruções como:

- lançar receita;
- lançar despesa;
- cadastrar conta;
- receita/despesa fixa por dia;
- multas e encargos;
- Mercado Pago;
- Point;
- PIX;
- débito/crédito;
- InfinitePay;
- orçamento;
- metas;
- IA Financeira;
- assinatura.

## Navegação inteligente

Os cartões possuem atalhos que direcionam o usuário para o módulo correto.

Exemplos:

- **Abrir Dashboard**;
- **Abrir Movimentações**;
- **Ir para Contas**;
- **Configurar recebimentos**;
- **Abrir Cartões**;
- **Abrir Orçamentos**;
- **Abrir Metas**;
- **Abrir IA Financeira**;
- **Ver Assinatura**.

## Conteúdo sobre Mercado Pago Point

A central orienta o usuário sobre o fluxo correto:

1. Abrir Movimentações → Recebimentos;
2. Conectar Mercado Pago;
3. Autorizar usando a conta titular que receberá as vendas;
4. Buscar as Points;
5. Selecionar a maquininha;
6. Ativar modo PDV;
7. Receber PIX, Débito ou Crédito pelo RENOVA;
8. Aguardar conciliação automática antes de criar outro lançamento manual.

Também foram documentados os erros mais comuns:

- `There is already a queued order on the terminal`;
- conta logada como colaborador em vez de titular;
- `Failed to fetch`;
- pagamento aprovado ainda não conciliado;
- terminal em modo PDV;
- problemas de contraste/cache.

## Segurança

A Central de Instruções reforça que nunca devem ser compartilhados:

- senha do Mercado Pago;
- Access Token;
- Client Secret;
- service_role do Supabase;
- outras credenciais privadas.

## Arquivos

- `js/help-center-module.js`
- `css/help-center-module.css`
- `js/config.js` — carregamento do módulo

## Diretriz de manutenção

Sempre que um módulo importante for criado ou alterado no Minhas Finanças RENOVA, a Central de Instruções deve ser revisada na mesma entrega. O objetivo é manter a orientação do usuário sincronizada com o produto real, evitando documentação desatualizada e retrabalho de suporte.
