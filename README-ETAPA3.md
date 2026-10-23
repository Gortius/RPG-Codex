# RPG Codex — Revisão de UX da Calculadora (Etapa 3)

Este pacote é um **overlay** para o repositório existente. Ele contém somente os arquivos que precisam ser adicionados/substituídos; não substitui o projeto inteiro.

## Antes de atualizar

1. Exporte um backup JSON do projeto atual usando **Projects → Export project**.
2. Faça uma cópia local do repositório.
3. Extraia o ZIP na raiz do repositório, mantendo os caminhos `js/...` e `css/...`.
4. Faça commit/publicação pelo seu fluxo normal no GitHub Pages.

O pacote aumenta os parâmetros de versão dos módulos e do CSS para `20261023-r5` para reduzir a chance de carregar arquivos antigos em cache.

## O que mudou

### Propriedades tipadas nos registros

Cada propriedade possui um tipo:

- **Number** — valor numérico direto.
- **Percentage (%)** — digite `20` para representar 20%; o valor é guardado como fração `0.2`.
- **Text** — texto livre.
- **List** — lista heterogênea. Cada item pode ser texto, número, porcentagem, referência a um registro ou valor JSON.

Os itens do tipo **Record reference** guardam o ID estável do registro, não seu nome. Se o registro for renomeado, a referência continua apontando para o mesmo ID; se ele não existir mais, a interface indica a referência ausente.

### Migração de propriedades antigas

As propriedades antigas não tinham tipo explícito. Ao carregar os dados:

- strings numéricas simples, como `"42"`, são inferidas como **Number**;
- strings no formato `"20%"` são inferidas como **Percentage** e convertidas para `0.2`;
- valores não numéricos, como `"3 seconds"`, permanecem **Text**;
- arrays são inferidos como **List**.

Como strings que contêm somente dígitos podem, em alguns bancos, ter sido intencionalmente texto, faça backup antes de atualizar e confira casos especiais. É possível mudar o tipo para **Text** no editor se necessário.

### Nova experiência de fórmulas

- Um fator novo começa com uma fonte de registro e a variável `X`.
- Cada variável tem seu próprio nome, fonte e propriedade numérica associada.
- Adicione fontes quando precisar de outro participante (por exemplo, Target) e variáveis quando precisar de outro valor (por exemplo, `Y`).
- A fórmula usa os nomes definidos: `X * (100 / (100 + 2.5 * Y))`.
- Os chips para inserir variáveis acompanham os nomes e as associações atuais.
- Não é necessário restringir tipos ou categorias de registros. Para uma variável, o seletor mostra somente propriedades Number/Percentage; na execução, um registro aparece se tiver as propriedades numéricas exigidas.
- Text e List ficam disponíveis normalmente nos registros, mas não são aceitos em fórmulas aritméticas.

### Execução e comparação

Inclui seleção múltipla por fonte, filtro por nome, combinações cartesianas, pareamento por posição, limite de combinações, tabela de resultados, ordenação/filtros/destaques, modificadores temporários e comparação do cenário base com o cenário modificado. Os modificadores são aplicados só durante aquela execução.

### Fatores e backups

Fatores permanecem isolados por projeto. A calculadora disponibiliza exportação/importação de fatores e também **Export project + factors / Import project + factors**, que leva os fatores junto dos dados do projeto. Os botões de backup existentes em Projects não foram redesenhados nesta revisão; para transportar fatores, use os botões de backup dentro da Calculadora.

## Verificações realizadas

- Sintaxe JavaScript dos módulos alterados.
- Testes automatizados da calculadora: fórmula individual, combinações em massa, cenário temporário, variável com nome personalizado, layout estreito e backup combinado.
- Testes do editor de propriedades: Number, Percentage, lista mista com referência a registro e JSON inválido.
- Testes do modelo de dados: inferência de propriedades antigas e round-trip de Number, Percentage e List no backup.

A publicação real no seu GitHub Pages e a interação com o banco salvo no seu navegador ainda precisam ser confirmadas depois de aplicar o pacote. Nenhum arquivo foi alterado diretamente no GitHub.
