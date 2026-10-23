# RPG Codex — Calculadora Etapa 3 — UX Rev3

Esta é uma atualização incremental para quem já aplicou o pacote **RPG-Codex-Calculadora-Etapa3-UX-Rev2.zip**. Ela contém apenas os arquivos necessários para as melhorias de interface descritas abaixo; não é uma cópia completa do repositório.

## Antes de aplicar

1. Exporte um backup do projeto antes de atualizar.
2. Faça uma cópia local do repositório atual.
3. Extraia este ZIP na raiz do repositório, mantendo os caminhos das pastas.
4. Publique pelo seu fluxo normal no GitHub Pages.
5. Após publicar, faça uma atualização forçada no navegador (`Ctrl+F5`) se a versão antiga continuar aparecendo.

Se ainda não aplicou a revisão UX Rev2, aplique-a primeiro. Este ZIP assume que a estrutura da Etapa 3 e as propriedades tipadas já estão instaladas.

## O que mudou

- Removido o campo **Role in the calculation**. Ele não alterava o comportamento da fórmula.
- O nome de exibição de cada fonte passou a ser opcional. Se ficar em branco, o app usa um rótulo automático como `Source 1` apenas para identificar a fonte na interface; a associação da variável continua funcionando normalmente.
- Refeito o seletor de registros: abre um modal com busca por nome/tipo/categoria/tags, filtros por tipo e categoria, seleção múltipla, seleção visível, limpar seleção e confirmar/cancelar.
- O modal lista somente registros compatíveis com as propriedades Number/Percentage necessárias às variáveis e às dependências conectadas.
- A escolha de registros mostra um resumo compacto em vez de deixar a lista completa aberta na página.
- Opções de combinações, cenários temporários e configurações de resultados ficam recolhidas por padrão; a seção de cenário abre quando está ativada.
- A área do editor esconde a lista de fatores durante a edição e mantém os botões de salvar/cancelar acessíveis enquanto se rola a página.
- Dependências ficaram mais explicativas e recolhidas por padrão: escolha um fator, conecte cada entrada dele a uma fonte deste fator e insira a saída como chip na fórmula. O sistema executa o fator dependente primeiro e passa os resultados para a fórmula atual.
- Ao alterar seleções de registros, os modificadores temporários existentes permanecem configurados.
- O `index.html` atualiza o identificador de cache dos módulos para `20261023-r6`.

## Arquivos deste pacote

- `index.html`
- `js/features/calculator.js`

O CSS desta revisão é carregado pelo módulo da calculadora, por isso não é necessário substituir `css/main.css`.

## Testes realizados nesta revisão

- `node --check` no módulo da calculadora.
- Teste em navegador da calculadora: cálculo individual, combinações cartesianas, cenário temporário, variável personalizada, fontes sem nome, ausência do campo Role, dependência e mapeamento de entradas, filtro de registros compatíveis, modal de seleção, layout móvel e backup combinado.
- Testes do editor de propriedades: Number, Percentage armazenada como fração, lista heterogênea com referência a registro e rejeição de JSON inválido.

Esses testes passaram no ambiente automatizado usado para a revisão. A publicação e a interação com os dados reais do seu navegador ainda precisam ser confirmadas depois de aplicar o ZIP.
