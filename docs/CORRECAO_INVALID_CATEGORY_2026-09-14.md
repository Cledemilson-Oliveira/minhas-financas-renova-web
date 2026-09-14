# Correção `invalid_category` — 14/09/2026

## Sintoma

Ao criar uma receita integrada com Mercado Pago Point, o usuário selecionava uma categoria válida na interface, mas a Edge Function `mercado-pago-point` retornava `invalid_category` antes de enviar a cobrança ao Mercado Pago.

Também era possível observar categorias repetidas no seletor da nova movimentação.

## Causa

A Conta Dono possui políticas administrativas que permitem visão global de dados. O carregamento legado do formulário de nova movimentação consultava categorias sem restringir explicitamente `user_id`.

Com isso, categorias de outros usuários podiam aparecer no seletor da Conta Dono. Os nomes eram iguais, por isso pareciam duplicatas. Ao escolher uma dessas categorias, o frontend enviava o UUID pertencente a outro usuário.

A Edge Function agiu corretamente ao rejeitar esse UUID, pois valida que `category_id` pertence ao usuário autenticado.

## Correção

Foi criado:

- `js/user-financial-scope-fix.js`

O módulo:

- carrega somente contas do usuário autenticado;
- carrega somente categorias do usuário autenticado;
- limpa duplicações do formulário de nova movimentação;
- preserva a seleção por nome quando a opção antiga apontava para um UUID de outro usuário;
- reaplica o isolamento quando o tipo Receita/Despesa muda;
- reaplica o isolamento quando o formulário é aberto;
- observa alterações legadas no formulário e restaura o escopo correto.

O módulo é carregado por `js/config.js`.

## Segurança

A validação do backend **não foi afrouxada**. `mercado-pago-point` continua recusando categoria que não pertença ao usuário autenticado.

Essa é a proteção correta: o frontend foi corrigido para enviar o UUID certo, em vez de permitir referências cruzadas entre usuários.

## Commits

- `b9d03fca1e04a9261bc3b0ae32cabd58ebb88a2f` — criar isolamento de contas/categorias por usuário.
- `a0f0cd9198d65f9e037ee2060c5acf0cdfa2f923` — carregar o módulo de isolamento financeiro.

## Reteste

1. Atualizar a aplicação com `Ctrl + F5`.
2. Abrir **Nova movimentação → Receita**.
3. Confirmar que as categorias não aparecem repetidas.
4. Selecionar uma categoria.
5. Selecionar **Débito** ou **Crédito**.
6. Selecionar a Point integrada.
7. Clicar **Cobrar na Point**.
8. A cobrança deve prosseguir sem `invalid_category`.
