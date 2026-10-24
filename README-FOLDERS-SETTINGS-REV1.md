# RPG Codex — Type/Tags, Pastas e Configurações (Rev. 1)

Este é um pacote de atualização incremental para aplicar manualmente ao repositório existente. Ele **não** substitui os outros módulos do projeto.

## Arquivos incluídos

- `index.html` — atualiza os parâmetros de cache e carrega o módulo de pastas depois dos módulos existentes.
- `js/features/enhancements.js` — inclui as pastas no backup/importação e remove os dados de pastas ao excluir um projeto.
- `js/features/folders.js` — novo módulo com pastas, configurações, seletor de referências e limpeza da interface antiga de Category/Subcategory.

## Instalação manual

1. Faça um backup JSON de cada projeto que seja importante.
2. Extraia o ZIP na raiz do repositório `RPG-Codex`, mantendo os caminhos das pastas e substituindo os dois arquivos existentes (`index.html` e `js/features/enhancements.js`). O arquivo `js/features/folders.js` é novo.
3. Envie os arquivos ao GitHub Pages.
4. Abra o app e faça uma recarga forçada (`Ctrl+F5`). Teste primeiro com um projeto de teste ou com um backup disponível.

## Mudanças

- `Type` e `Tags` passam a ser a organização visível dos registros. Category/Subcategory ficam ocultos na interface e os valores antigos desses dois campos são limpos do armazenamento do projeto ativo quando a atualização é inicializada. Type, Tags, propriedades e relações são preservados.
- O seletor de referências de registros dentro de listas abre uma janela com pesquisa por nome, type, tags, descrição e valores de propriedades, além de filtros por type e tag.
- O editor de propriedades deixa de exibir o rótulo `Value type`, reduzindo a altura de cada linha.
- O menu de projetos no botão de três linhas usa os ícones conforme solicitado: Export = ícone de upload e Import = ícone de download.
- Pastas têm ID interno, nome e tags; podem ser criadas, editadas e excluídas. Excluir uma pasta não exclui os registros; eles ficam sem pasta.
- Cada registro pode pertencer a uma pasta ou ficar sem pasta. O filtro da pasta selecionada atua sobre os resultados normais da pesquisa/filtros.
- As pastas aparecem antes da pesquisa e dos filtros por padrão. Em **Settings**, é possível ocultá-las. Ao ocultá-las, o filtro de pasta ativo é limpo para não esconder registros sem uma indicação visível.
- Pastas, atribuições e seleção da pasta são separadas por projeto e incluídas nos backups JSON. Ao importar backups antigos que não contêm pastas, a importação de substituição inicia o projeto sem pastas.
- A tela **Settings** fica no menu lateral.

## Validação e limitações

A sintaxe dos arquivos JavaScript foi verificada com `node --check` e verificações estáticas confirmaram as conexões entre o carregamento do módulo, a interface e os backups. A execução visual completa em navegador não pôde ser validada neste ambiente. Após a instalação, teste criação/edição/remoção de pasta, atribuição a registros, seleção pesquisável de referências e exportação/importação de backup antes de usar o pacote como única cópia dos dados.
