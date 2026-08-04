
    <script>
        document.addEventListener("DOMContentLoaded", () => {
            // 1. Извлекаем искомое слово из URL
            let keyword = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');
            
            // Если путь пустой (просто /) или содержит техническое имя, проверяем параметры ?q=
            if (!keyword || keyword.toLowerCase() === 'search' || keyword.toLowerCase() === 'index.html') {
                const urlParams = new URLSearchParams(window.location.search);
                keyword = urlParams.get('q');
            }

            // 2. Если слово найдено — обновляем заголовок и запускаем поиск
            if (keyword) {
                document.getElementById('keywordDisplay').textContent = keyword;
                document.title = `${keyword} - Dhamma.gift Search`;
                executeGlobalSearch(keyword, 'default');
            } else {
                document.getElementById('searchHeading').textContent = 'No search keyword provided in URL.';
            }
        });

        // Функция запроса к Node.js API
        async function executeGlobalSearch(keyword, scope = 'default') {
            try {
                // В продакшене укажи относительный путь: `/search?q=${keyword}`
                const response = await fetch(`http://localhost:3000/search?q=${keyword}&scope=${scope}`);
                
                if (!response.ok) throw new Error("Network response was not ok");
                
                const json = await response.json();
                const dataArray = Object.values(json.data);
                
                renderDataTable(dataArray, keyword);
                
            } catch (error) {
                console.error('Fetch error:', error);
                document.getElementById('searchHeading').textContent = 'Error connecting to search server.';
            }
        }

        // Функция инициализации DataTables
        function renderDataTable(dataArray, keyword) {
            if ($.fn.DataTable.isDataTable('#pali')) {
                $('#pali').DataTable().clear().destroy();
            }

            const highlightRegex = new RegExp(keyword, 'gi');

            $('#pali').DataTable({
                data: dataArray,
                responsive: true,
                pageLength: 25,
                order: [[4, 'desc']], // Сортировка по колонке Mr (индекс 4)
                columns: [
                    {
                        data: 'sutta_id',
                        className: 'text-nowrap',
                        render: function (data) {
                            return `<a class="fdgLink mainLink" target="_blank" href="/?q=${data}">${data}</a>`;
                        }
                    },
                    {
                        data: 'titles',
                        render: function (data, type, row) {
                            if (!data) return '';
                            let title = data.ru_o || data.ru_sv || data.en_sujato || data.root || row.sutta_id;
                            return `<strong class="pli-lang inputscript-ISOPali">${title}</strong>`;
                        }
                    },
                    {
                        data: 'unique_words',
                        render: function (data) {
                            if (!data || !data.length) return '';
                            return `<span class="pli-lang inputscript-ISOPali">${data.join(', ')}</span>`;
                        }
                    },
                    { data: 'count' },
                    { data: 'mr' },
                    {
                        data: 'sutta_id',
                        orderable: false,
                        className: 'text-nowrap',
                        render: function (data) {
                            return `<a class="dprLink" target="_blank" href="https://suttacentral.net/${data}/pli/ms">Pi</a> 
                                    <a class="bwLink" target="_blank" href="https://suttacentral.net/${data}/en/sujato">En</a> 
                                    <a class="ruLink" target="_blank" href="https://suttacentral.net/${data}/ru/o">Ru</a>`;
                        }
                    },
                    { data: 'category' },
                    {
                        data: 'segments',
                        className: 'none', // Скрытая колонка (показывается по клику)
                        render: function (data) {
                            if (!data || data.length === 0) return '';
                            let quoteHtml = '';

                            data.forEach(seg => {
                                let paliText = seg.root_text || '';
                                let transText = '';

                                if (seg.translations) {
                                    const transKeys = Object.keys(seg.translations);
                                    const ruKey = transKeys.find(k => k.startsWith('ru_'));
                                    const enKey = transKeys.find(k => k.startsWith('en_'));
                                    transText = seg.translations[ruKey] || seg.translations[enKey] || '';
                                }

                                if (paliText) paliText = paliText.replace(highlightRegex, match => `<b class="match finder">${match}</b>`);
                                if (transText) transText = transText.replace(highlightRegex, match => `<b class="match finder">${match}</b>`);

                                quoteHtml += `
                                    <p class="mb-3">
                                        <a target="_blank" class="fdgLink quoteLink text-decoration-none" href="/?q=${seg.segment}">
                                            <span class="pli-lang">${paliText}</span>
                                        </a><br>
                                        <span class="eng-lang text-muted">${transText}</span>
                                    </p>
                                `;
                            });

                            return quoteHtml;
                        }
                    }
                ]
            });
        }
    </script>
  




  <script type='text/javascript'>
   $(document).ready(function() {
   DataTable.util.diacritics(d => d);
       // Регистрируем собственный тип сортировки для чекбоксов
    $.fn.dataTable.ext.order['dom-checkbox'] = function(settings, col) {
        return this.api().column(col, { order: 'index' }).nodes().map(function(td, i) {
            return $('input', td).prop('checked') ? '1' : '0';
        });
    };
   
   var dataSrc = [];
   var filterValue = new URLSearchParams(window.location.search).get('f');

$(document).ready(function() {
    // Загрузка файла с данными
    $.ajax({
        url: '/assets/js/textinfo.json',
        dataType: 'json',
        success: function(TextInfo) {
            // Заполнение данных в таблице
$('#pali').find('tbody').find('tr').each(function() {
    var linkText = $(this).find('td').eq(0).find('a').text();
    
    if (TextInfo[linkText]) {
        var titlePali = TextInfo[linkText]['pi'] || ''; // Пали
        var titleEnglish = TextInfo[linkText]['en'] || ''; // Английский
        var titleRussian = TextInfo[linkText]['ru'] || ''; // Русский
        var metaphorCount = TextInfo[linkText]['mtph'] || ''; // Количество метафор

        // Проверяем localStorage и URL
       // var siteLanguage = localStorage.getItem('siteLanguage');
     //   var useRussian = (siteLanguage === 'ru') || window.location.pathname.includes('/ru/');
     var useRussian = window.location.pathname.includes('/ru/');

        var titleText = useRussian && titleRussian ? titleRussian : titleEnglish; // Если русский есть, берем его, иначе английский

        $(this).find('td').eq(1).html('<strong class="pli-lang inputscript-ISOPali">' + titlePali + '</strong> ' + titleText);
        $(this).find('td').eq(4).text(metaphorCount);
    } else {
        // Если данных нет, заполняем пустыми значениями
        $(this).find('td').eq(1).html('');
        $(this).find('td').eq(4).text('');
    }
});
        
var desktopDom = '<"row"<"col-sm-12 col-md-4"l><"col-sm-12 col-md-5"p><"col-sm-12 col-md-3"f>>rt<"row"<"col-sm-12 col-md-4"i><"col-sm-12 col-md-8"p>><""Q><"footerlike"B>';

var mobileDom = '<"row"<"col-sm-6"l><"col-sm-6"f>><"row"<"col-sm-12"p>>rt<"row"<"col-sm-12"i><"col-sm-12"p>><""Q><"footerlike"B>';

     var tableDom = $(window).width() > 768 ? desktopDom : mobileDom;

   	 var table = $('#pali').DataTable({
	 /*  'autoWidth': true,*/
	   'stateSave': true,
  stateSaveParams: function(settings, data) {
    data.search.search = ''; 
  },
    dom: tableDom,
  language: {
        search: '',
        lengthMenu: '_MENU_ per page',
        searchPlaceholder: 'Filter...'
    },
             searchBuilder: {
            preDefined: {
                criteria:[
{ condition: '!contains', data: 'Quote', value: ['ExcludeMe']}                ],
                logic: 'AND'
            }
        },   
	    

	   buttons: [
  {
    text: 'Main',
    className: 'btn btn-link',
    action: function () {
      window.location.href = "/";
    }
  },
  {
    text: 'History',
    className: 'btn btn-link',
    action: function () {
      window.location.href = '/history.php';
    }
  },
  {
    extend: 'collection',
    text: 'Export',
    className: 'btn btn-link',
    buttons: [
      {
        extend: 'copyHtml5',
	      exportOptions: {
          columns: function (idx, data, node) {
            return $('#pali').DataTable().column(idx).visible();
          },
          modifier: {
            search: 'applied'
          }
        }
      },
      {
        extend: 'excelHtml5',
	      exportOptions: {
          columns: function (idx, data, node) {
            return $('#pali').DataTable().column(idx).visible();
          },
          modifier: {
            search: 'applied'
          }
        }
      },
      {
        extend: 'csvHtml5',
	      exportOptions: {
          columns: function (idx, data, node) {
            return $('#pali').DataTable().column(idx).visible();
          },
          modifier: {
            search: 'applied'
          }
        }
      },
      {
        text: 'TXT',
        action: function (e, dt, node, config) {
          var data = dt.buttons.exportData({
            columns: function (idx) {
              return dt.column(idx).visible();
            },
            modifier: { search: 'applied' }
          });
          
          var textContent = [];
          
          textContent.push(data.header.join('\t'));
          
          data.body.forEach(function(row) {
            var cleanRow = row.map(function(cell) {
              return typeof cell === 'string' ? cell.replace(/\r?\n|\r/g, ' ') : cell;
            });
            textContent.push(cleanRow.join('\t'));
          });
          
          var filename = document.title !== '' ? document.title : 'Export';
          filename = filename.replace(/[^a-zA-Z0-9_\u00A1-\uFFFF\.,\-_ !\(\)]/g, "");
          
          var blob = new Blob([textContent.join('\n')], { type: 'text/plain;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          
          var a = document.createElement('a');
          a.href = url;
          a.download = filename + '.txt';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      },
         {
        text: 'PDF',
        title: '*', 
        filename: '*', 
        exportOptions: {
          columns: function (idx, data, node) {
            return $('#pali').DataTable().column(idx).visible();
          },
          modifier: { search: 'applied' },
          format: {
            body: function (data, row, column, node) {
              if (data === null || data === undefined) return '';
              
              var text = String(data);
              var temp = document.createElement('div');
              temp.innerHTML = text;
              
              // 1. Сохраняем ссылки
              var links = temp.querySelectorAll('a');
              links.forEach(function(a) {
                var url = a.href;
                var linkText = a.textContent || a.innerText;
                var placeholder = document.createTextNode('LINK_START|' + url + '|' + linkText + '|LINK_END');
                a.parentNode.replaceChild(placeholder, a);
              });

              // 2. Сохраняем тег strong (используется для Пали в колонке Title)
              var strongs = temp.querySelectorAll('strong');
              strongs.forEach(function(s) {
                var placeholder = document.createTextNode('BOLD_START|' + (s.textContent || s.innerText) + '|BOLD_END');
                s.parentNode.replaceChild(placeholder, s);
              });
              
              // 3. Сохраняем абзацы и переносы строк для колонки Quote
              var brs = temp.querySelectorAll('br');
              brs.forEach(function(br) {
                br.parentNode.replaceChild(document.createTextNode('\n'), br);
              });
              var ps = temp.querySelectorAll('p');
              ps.forEach(function(p) {
                p.insertAdjacentText('beforeend', '\n');
              });
              
              // Удаляем весь остальной HTML и обрезаем пробелы
              return (temp.textContent || temp.innerText || '').trim();
            }
          }
        },
        customize: function (doc) {
          doc.defaultStyle.font = 'NotoSans';
          doc.pageOrientation = 'landscape';
          
          var body = doc.content[1].table.body;
          body.forEach(function(row) {
            row.forEach(function(cell) {
              if (typeof cell.text === 'string') {
                // Если в ячейке есть наш маркер жирного шрифта, значит это колонка Title
                var hasBold = cell.text.includes('BOLD_START|');
                var lines = cell.text.split('\n');
                var formattedCell = [];
                
                lines.forEach(function(line, lineIdx) {
                  // Сохраняем пустые строки между абзацами
                  if (line === '') {
                      if (lineIdx < lines.length - 1) formattedCell.push({ text: '\n' });
                      return;
                  }
                  
                  // Разбиваем строку на спец-маркеры и обычный текст
                  var parts = line.split(/(BOLD_START\|.*?\|BOLD_END|LINK_START\|.*?\|.*?\|LINK_END)/g);
                  
                  parts.forEach(function(part) {
                    if (!part) return;
                    
                    if (part.startsWith('LINK_START|')) {
                      var match = part.split('|');
                      formattedCell.push({ 
                        text: match[2], 
                        link: match[1], 
                        color: '#0d6efd', 
                        decoration: 'underline' 
                      });
                    } else if (part.startsWith('BOLD_START|')) {
                      var match = part.split('|');
                      formattedCell.push({ 
                        text: match[1], 
                        bold: true,
                        color: '#000000' // Черный цвет для Пали
                      });
                    } else {
                      // ЛОГИКА ЗАТЕМНЕНИЯ ВТОРОГО ЯЗЫКА:
                      // Если это Title (hasBold = true), то весь текст без маркера - это перевод (тусклый).
                      // Если это Quote (hasBold = false), то первая строка - Пали (черный), остальные - перевод (тусклый).
                      var isDim = hasBold ? true : (lineIdx > 0);
                      formattedCell.push({ 
                        text: part,
                        color: isDim ? '#666666' : '#000000'
                      });
                    }
                  });
                  
                  // Добавляем перенос после каждой обработанной строки
                  if (lineIdx < lines.length - 1) {
                      formattedCell.push({ text: '\n' });
                  }
                });
                
                cell.text = formattedCell;
              }
            });
          });
        },
        action: function (e, dt, node, config) {
          var buttonContext = this;
          
          var triggerPdfExport = function() {
            pdfMake.fonts = {
              NotoSans: {
                normal: 'NotoSans-Regular.ttf',
                bold: 'NotoSans-Bold.ttf',
                italics: 'NotoSans-Italic.ttf',
                bolditalics: 'NotoSans-BoldItalic.ttf'
              }
            };

            var pdfConfig = $.extend(true, {}, $.fn.dataTable.ext.buttons.pdfHtml5, config);
            $.fn.dataTable.ext.buttons.pdfHtml5.action.call(buttonContext, e, dt, node, pdfConfig);
          };
          
          if (typeof pdfMake === 'undefined') {
            var originalText = node.text();
            node.text('Loading...'); 
            
            var loadScript = function(url, callback) {
              var script = document.createElement('script');
              script.type = 'text/javascript';
              script.src = url;
              script.onload = callback;
              document.head.appendChild(script);
            };

            loadScript('/assets/js/pdfmake.min.js', function() {
              loadScript('/assets/js/vfs_fonts.js', function() {
                node.text(originalText); 
                triggerPdfExport();
              });
            });
          } else {
            triggerPdfExport();
          }
        }
      }

    ]
  },
  {
    text: 'Read',
    className: 'btn btn-link',
    action: function () {
      window.location.href = "/read.php";
    }
  },
  {
    text: 'Make List',
    className: 'btn btn-link',
    action: function () {
      window.location.href = '/assets/makelist.html';
    }
  },
  {
    text: 'List Diff',
    className: 'btn btn-link',
    action: function () {
      window.location.href = '/assets/listdiff.html';
    }
  },
  {
    text: 'Sutta Diff',
    className: 'btn btn-link',
    action: function () {
      window.location.href = '/assets/diff';
    }
  },
  {
    extend: 'colvis',
    className: 'btn btn-link',
    text: 'Visibility'
  }
],
                        
      "search": {
    "caseInsensitive": true,
		"diacritics": false,
        "smart": true
  },
	   'paging'  : true,
	    'colReorder': true,
	    'orderMulti': true,
	   'pageLength' : 10,
	   'lengthMenu' : [10, 30, 50, 100, 1000],

	/*  'responsive': true,*/
	  'columnDefs': [
		/*		{                
				targets: [8], // Индекс столбца с чекбоксами
				orderDataType: 'dom-checkbox' // Используем функцию сортировки
				},
				*/
	      { type: 'natural', targets: 0 },
	      { type: "html", target: [0,1,2,7] },
				  {
            target: 6,
            visible: false
        }	,
        {
            targets: [3],
            orderData: [3, 4],
            orderSequence: ['desc', 'asc'] 
        },
        {
            targets: [4],
            orderData: [4, 3],
            orderSequence: ['desc', 'asc'] 
        }
					],
	     "order": [[6, 'asc']],
      'initComplete': function(){
         var api = this.api();
         
         
             // Handle click on "Expand All" button
    $('#btn-show-all-children').on('click', function(){
        // Expand row details
        table.rows(':not(.parent)').nodes().to$().find('td:first-child').trigger('click');
    });
    // Handle click on "Collapse All" button
    $('#btn-hide-all-children').on('click', function(){
        // Collapse row details
        table.rows('.parent').nodes().to$().find('td:first-child').trigger('click');
    });
         

         // Populate a dataset for autocomplete functionality
		          api.cells('tr', [0, 2, 3, 4, 5]).every(function(){
            //var data = this.data().replace( /(<([^>]+)>)/ig, '');
            var data = $('<div>').html(this.data()).text();
          //  console.log(data);
            if(dataSrc.indexOf(data) === -1){ dataSrc.push(data); }
         });

      } // автозаполнение какоето
      
   });	//конец datatable	         
   
      //предустановка фильтра из get param ?f=
     if (filterValue) {
        table.search(filterValue).draw();
        var currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('f');
        history.replaceState({}, '', currentUrl);
}
  // s param и div keyword
 
let params = new URLSearchParams(document.location.search);
let finder = (params.get("s") || "").replace(/ṃ/g, "ṁ");
let keyword;

// Проверяем наличие элемента с классом "keyword"
let keywordElement = document.querySelector('.keyword');
if (keywordElement) {
    keyword = keywordElement.textContent.trim().replace(/ṃ/g, "ṁ");
} else {
    keyword = ""; // Значение по умолчанию, если элемент не найден
}

// Используем значение из параметра "s" или "keyword"
//let searchValue = finder && finder.trim() !== "" ? finder : keyword;
let searchValue = finder && finder.trim() !== "" ? finder.replace(/\\b/g, '') : keyword.replace(/\\b/g, '');
if (searchValue !== "") {
    // Получаем таблицу DataTables по ее id

    // Получаем все строки таблицы
    table.rows().every(function(rowIdx, tableLoop, rowLoop) {
        // Получаем данные в текущей строке
        var rowData = this.data();

rowData.forEach(function(cellData, index) {
    // Only proceed if there is a search value and the cell data is a string
    if (searchValue && typeof cellData === 'string') {
        
        // Create a temporary, disconnected HTML element to safely parse the cell's content.
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = cellData;

        // A recursive function to traverse the HTML nodes
        function highlightInNode(node) {
            // We only care about text nodes (nodeType === 3)
            if (node.nodeType === 3) {
                const text = node.nodeValue;

                // Use the user's search term directly as a regular expression, without escaping it.
                // This ensures that ".*" and other special characters work as intended.
                const regex = new RegExp(searchValue, 'gi');

                if (regex.test(text)) {
                    const fragment = document.createDocumentFragment();
                    let lastIndex = 0;

                    // Replace all matches in the current text node
                    text.replace(regex, (match, offset) => {
                        // Append the text that comes before the match
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, offset)));

                        // Create the highlighted element for the match
                        const highlighted = document.createElement('b');
                        highlighted.className = 'match finder';
                        highlighted.textContent = match;
                        fragment.appendChild(highlighted);

                        lastIndex = offset + match.length;
                    });

                    // Append any remaining text after the last match
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                    
                    // Replace the original text node with our new fragment
                    node.parentNode.replaceChild(fragment, node);
                }
            }
            // If it's an element node (nodeType === 1), recursively check its children
            else if (node.nodeType === 1 && node.childNodes && !/^(script|style)$/i.test(node.tagName)) {
                // We go backwards because the number of child nodes can change during replacement
                for (let i = node.childNodes.length - 1; i >= 0; i--) {
                    highlightInNode(node.childNodes[i]);
                }
            }
        }

        // Start the highlighting process from the top of our temporary container
        highlightInNode(tempContainer);

        // Update the table cell with the safely modified HTML
        table.cell(rowIdx, index).data(tempContainer.innerHTML);
    }
});
    });

    // Перерисовываем таблицу для применения изменений
    table.draw(false);
}


//конец s и keyword            
        },
        error: function(xhr, status, error) {
            console.error('Ошибка при загрузке файла с данными:', status, error);
        }
    });
});

	
  

   
   //highlight pattern
   

});


  </script>
