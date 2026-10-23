# RPG Codex — Etapa 3: Calculadora entre registros

Este ZIP é um **overlay** para aplicar sobre uma cópia atual do repositório RPG Codex. Ele não contém uma cópia completa do aplicativo e não altera o GitHub automaticamente.

## Arquivos incluídos

- `index.html`: entrada atual da aplicação com a importação do módulo da calculadora e um identificador de cache novo (`20261023-r3`).
- `js/features/calculator.js`: módulo novo da calculadora; todos os seus estilos ficam isolados com prefixo `calc-` e o armazenamento é separado por projeto.

Não substitua os outros arquivos do RPG Codex pelos arquivos de qualquer versão antiga.

## Como aplicar

1. Faça um backup dos dados que já estão no RPG Codex pelo menu atual de projetos.
2. Baixe e extraia este ZIP em uma cópia da versão mais recente do repositório.
3. Substitua o `index.html` existente pelo incluído no ZIP.
4. Adicione `js/features/calculator.js` no caminho exato `js/features/calculator.js`. Preserve os outros módulos existentes, especialmente `js/app.js`, `js/data/storage.js` e `js/features/enhancements.js`.
5. Envie esses dois arquivos para o repositório e publique pelo fluxo que você já usa. Não envie o ZIP como se fosse o módulo da aplicação.
6. Abra o aplicativo e escolha o botão de calculadora na navegação superior. Se a página estiver aberta durante a publicação, recarregue-a.

## O que foi implementado

- Biblioteca de fatores: criar, editar, duplicar, excluir e reutilizar fatores.
- Entradas com variável, papel (atacante, alvo, contexto ou outro), tipos/categorias permitidos, propriedades numéricas obrigatórias e opção de entrada opcional.
- Uma ou várias saídas por fator, expressões assistidas com sugestões de variáveis e dependências para encadear fatores.
- Interpretador matemático restrito. Ele não executa JavaScript arbitrário nem usa `eval()`.
- Operadores `+`, `-`, `*`, `/`, `^`, parênteses e funções `abs`, `ceil`, `floor`, `round`, `min`, `max`, `sqrt`, `pow`, `log` e `exp`.
- Cálculo individual, combinações cartesianas, pareamento por posição, uma entrada fixa enquanto outras variam e até 5.000 combinações por execução. Acima de 500, é exibida uma confirmação.
- Tabela com colunas configuráveis, busca por nome/erro, filtro numérico, ordenação e destaque opcional de máximos e mínimos.
- Cenários temporários com operações Definir, Somar, Subtrair, Multiplicar e Dividir, com comparação entre base e teste. A calculadora lê os registros sem alterar seus valores salvos.
- Erros isolados por combinação: uma linha com erro não impede a apresentação das demais linhas calculáveis.
- Fatores salvos no `localStorage` do navegador, em uma chave separada e escopada pelo projeto atual.
- Exportação/importação de fatores em JSON.
- Exportação/importação de backup combinado com os dados de projeto e fatores da calculadora.

## Fórmulas e valores

As fórmulas usam aliases com o formato `chaveDaEntrada_nome_da_propriedade`. Por exemplo, a propriedade `Damage` na entrada `attacker` fica disponível como `attacker_damage`; `Armor` na entrada `target` fica como `target_armor`. O editor mostra botões para inserir tokens conhecidos.

Propriedades são armazenadas pelo RPG Codex como valores de texto. Para usá-las em fórmulas, o valor precisa ser numérico (por exemplo, `125`, `1.5` ou `0.2`). Texto e listas não são entradas aritméticas nesta versão. Porcentagens seguem a convenção do projeto: **20% é armazenado como `0.2`**, sem uma conversão implícita para `20`.

O botão **Create damage example** cria uma fórmula de exemplo com entradas `Item` e `Mob`, usando as propriedades `Damage` e `Armor`. Ajuste os tipos, propriedades e fórmula à estrutura real dos seus registros. A fórmula é ilustrativa, não representa automaticamente o balanceamento definitivo do Clades.

Entradas opcionais podem ficar sem seleção quando o fator não precisa delas. Caso uma fórmula ou dependência use uma variável da entrada omitida, essa combinação apresentará um erro explicando qual variável ou entrada está faltando.

## Backups e compatibilidade

Os fatores são salvos por projeto e por perfil de navegador, como os demais dados locais do aplicativo. Para manter os fatores junto de um backup, use **Export project + factors** dentro da calculadora e, para restaurar esse arquivo, **Import project + factors**. A importação permite substituir os dados atuais ou escolher a mesclagem. A mesclagem remapeia IDs de fatores em conflito e atualiza as dependências para não apontarem acidentalmente para fatores errados.

Os botões antigos de exportação/importação do menu de projetos não foram reescritos neste overlay e **não incluem automaticamente os fatores da calculadora**. Use a opção combinada da calculadora quando precisar preservar registros, catálogos, filtros salvos, lixeira e fatores no mesmo arquivo. Um backup antigo sem a seção de fatores mantém os fatores atuais intactos durante a importação combinada.

## Verificações realizadas

- `node --check` no módulo JavaScript.
- Testes da linguagem de fórmulas: precedência matemática, funções, expressão de dano, divisão por zero, expressão inválida e rejeição de chamadas não permitidas.
- Testes de execução com dependências, ciclo circular, cenários temporários, entrada opcional e mesclagem de fatores com conflito de IDs/nomes.
- Teste de interface em um navegador headless com registros fictícios: cálculo individual, 4 combinações em massa, cenário +20%, editor mantendo o rascunho após erro de validação, entrada opcional, persistência dos fatores, layout estreito e fluxo de exportação/importação combinada.
- No teste do navegador, a interface e o módulo da calculadora rodaram num pequeno shell de teste que simula as rotinas de persistência do aplicativo. A integração final com os dados reais do seu RPG Codex ainda precisa ser conferida após aplicar o overlay; não considero isso substituído pelo teste isolado.

Os testes utilizam registros fictícios em ambiente isolado e não substituem a revisão no seu banco real depois de aplicar o overlay.
