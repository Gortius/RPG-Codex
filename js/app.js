import {
  loadRecords as loadStoredRecords,
  saveRecords as saveStoredRecords,
  loadSavedFilters as loadStoredSavedFilters,
  persistFilters as persistStoredFilters
} from "./data/storage.js";
import { createRecordFeatures } from "./features/records.js";
import { createCatalogFeatures } from "./features/catalogs.js";
import { filterRecords } from "./features/filtering.js";
import { createViewFeatures } from "./features/views.js";
import { createPropertyEditor } from "./features/property-editor.js";
import { createPickerFeatures } from "./features/pickers.js";
import { createEditorFeatures } from "./features/editor.js";
import { createRecordFormFeature } from "./features/record-form.js";
import { createRecordListFeature } from "./features/record-list.js";
import { createFilterUIFeatures } from "./features/filter-ui.js";
import { createSavedFiltersFeature } from "./features/saved-filters.js";
 
"use strict";
const DEFAULT_TYPES=["Mob","Item","Material","Area","Recipe","Effect","Skill","NPC","Boss"];
const DEFAULT_TAGS=["Common","Uncommon","Rare","Epic","Legendary","Craftable","Quest","Optional"];
const DEFAULT_PROPS=["Health","Damage","Defense","Armor","Speed","Attack Speed","Cooldown","Duration","Level","Rarity"];
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>"r-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);
const uniq=a=>[...new Set(a.map(x=>String(x||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const starter=[
{id:"sample-mob",name:"Leafling",type:"Mob",category:"Beginning Hole",description:"A small creature found near the entrance.",tags:["Common"],properties:[{name:"Health",value:"20"},{name:"Damage",value:"3"}],related:[]},
{id:"sample-material",name:"Vines",type:"Material",category:"Beginning Hole",description:"A basic crafting material gathered from local creatures and plants.",tags:["Craftable"],properties:[{name:"Rarity",value:"Common"}],related:[]},
{id:"sample-item",name:"Leaf Bow",type:"Item",category:"Beginning Hole",description:"A simple bow made with materials from the starting area.",tags:["Craftable","Common"],properties:[{name:"Damage",value:"5"},{name:"Attack Speed",value:"1.0"}],related:["sample-recipe"]},
{id:"sample-area",name:"Beginning Hole",type:"Area",category:"Sector 1",description:"The player's starting area, featuring a locked door and an early guardian.",tags:["Starting Area"],properties:[{name:"Level",value:"1"}],related:["sample-mob"]},
{id:"sample-effect",name:"Slowness",type:"Effect",category:"Debuff",description:"Reduces the affected target's movement speed.",tags:["Debuff"],properties:[{name:"Duration",value:"3 seconds"}],related:[]},
{id:"sample-recipe",name:"Leaf Bow Recipe",type:"Recipe",category:"Beginning Hole",description:"Crafting recipe for the Leaf Bow.",tags:["Craftable"],properties:[{name:"Material Cost",value:"Vines + Wood"}],related:["sample-item"]}
];
let records=[],savedFilters=[];
let activeTypes=[],activeTags=[],conditions=[],expanded=new Set();
let filtersOpen=false,editingId=null,currentId=null,selectedTags=[],selectedRelated=[];
let tagOpen=false,relatedOpen=false,tagSearch="",relatedSearch="",tagCreateOpen=false;
function iconFor(type){return ({Mob:"👾",Item:"⚔️",Material:"💎",Area:"🌍",Recipe:"📜",Effect:"✨",Skill:"🔮",NPC:"🧑",Boss:"☠️"})[type]||"◆"}
function iconOf(r){return r.icon||iconFor(r.type)}
function loadRecords() {
  return loadStoredRecords(starter, uid);
}
function saveRecords() {
  if (!saveStoredRecords(records)) return false;

  syncCatalogs();
  saveCatalogs();

  $("status").textContent =
    "Saved in this browser · " + records.length + " records";

  return true;
}
const {
  syncCatalogs,
  mergeCatalog,
  loadCatalogs,
  saveCatalogs,
  catalogNames
} = createCatalogFeatures({
  getRecords: () => records,
  defaultTags: DEFAULT_TAGS,
  defaultProperties: DEFAULT_PROPS
});
const {
  setupSelect,
  readSelect,
  renderPropertyRows,
  addPropertyRow,
  readProperties
} = createPropertyEditor({
  $,
  esc,
  catalogNames
});

function persistFilters() {
  return persistStoredFilters(savedFilters);
}
function filterState(){return {query:$("search").value,types:[...activeTypes],category:$("filter-category").value,subcategory:$("filter-subcategory").value,tags:[...activeTags],sort:$("sort-records").value,conditions:conditions.map(c=>({...c}))}}
function applyFilterState(s){
 activeTypes=s.types||[];activeTags=s.tags||[];$("search").value=s.query||"";
 renderFilterOptions();$("filter-category").value=s.category||"";renderFilterOptions();$("filter-category").value=s.category||"";
 $("filter-subcategory").value=s.subcategory||"";$("sort-records").value=s.sort||"name-asc";
 conditions=(s.conditions||[]).map(c=>({...c}));renderConditionRows();renderCategories();renderRecords();updateFilterToggle();
}


const { renderRecords } = createRecordListFeature({
  $,
  esc,
  iconOf,
  getRecords: () => records,
  filterRecords,
  getFilterState: () => ({
    activeTypes,
    activeTags,
    conditions
  }),
  expanded,
  openRecord: id => openRecord(id)
});

const {
  renderCategories,
  renderFilterTags,
  renderFilterOptions,
  renderConditionRows,
  renderSavedFilters,
  updateFilterToggle
} = createFilterUIFeatures({
  $,
  esc,
  uniq,
  defaultTypes: DEFAULT_TYPES,
  getRecords: () => records,
  catalogNames,
  getActiveTypes: () => activeTypes,
  setActiveTypes: value => { activeTypes = value; },
  getActiveTags: () => activeTags,
  setActiveTags: value => { activeTags = value; },
  getConditions: () => conditions,
  getFiltersOpen: () => filtersOpen,
  getSavedFilters: () => savedFilters,
  renderRecords: () => renderRecords()
});

const {
  saveCurrentFilter,
  applySelectedFilter,
  deleteSelectedFilter
} = createSavedFiltersFeature({
  $,
  getSavedFilters: () => savedFilters,
  setSavedFilters: value => { savedFilters = value; },
  uid,
  getFilterState: () => filterState(),
  applyFilterState: state => applyFilterState(state),
  persistFilters: () => persistFilters(),
  renderSavedFilters: () => renderSavedFilters()
});

function renderHome(){
 $("home").hidden=false;$("detail").hidden=true;$("editor").hidden=true;
 renderCategories();renderFilterOptions();renderConditionRows();renderSavedFilters();renderRecords();updateFilterToggle();
}

const {
  getRecord,
  deleteRecord
} = createRecordFeatures({
  getRecords: () => records,
  setRecords: nextRecords => {
    records = nextRecords;
  },
  saveRecords,
  renderHome,
  expanded,
  setCurrentId: id => {
    currentId = id;
  }
});
const { renderPicker } = createPickerFeatures({
  $,
  esc,
  getRecords: () => records,
  getRecord,
  catalogNames,
  mergeCatalog,
  saveCatalogs,
  getEditingId: () => editingId,
  getSelectedTags: () => selectedTags,
  setSelectedTags: value => { selectedTags = value; },
  getSelectedRelated: () => selectedRelated,
  setSelectedRelated: value => { selectedRelated = value; },
  getTagOpen: () => tagOpen,
  setTagOpen: value => { tagOpen = value; },
  getRelatedOpen: () => relatedOpen,
  setRelatedOpen: value => { relatedOpen = value; },
  getTagSearch: () => tagSearch,
  setTagSearch: value => { tagSearch = value; },
  getRelatedSearch: () => relatedSearch,
  setRelatedSearch: value => { relatedSearch = value; },
  getTagCreateOpen: () => tagCreateOpen,
  setTagCreateOpen: value => { tagCreateOpen = value; }
});

let openRecord;
const { showForm, cancelForm } = createEditorFeatures({
  $,
  uniq,
  DEFAULT_TYPES,
  getRecords: () => records,
  getRecord,
  getCurrentId: () => currentId,
  setEditingId: value => { editingId = value; },
  setSelectedTags: value => { selectedTags = value; },
  setSelectedRelated: value => { selectedRelated = value; },
  setTagOpen: value => { tagOpen = value; },
  setRelatedOpen: value => { relatedOpen = value; },
  setTagCreateOpen: value => { tagCreateOpen = value; },
  setTagSearch: value => { tagSearch = value; },
  setRelatedSearch: value => { relatedSearch = value; },
  setupSelect,
  renderPropertyRows,
  renderPicker,
  openRecord: id => openRecord(id),
  renderHome
});
openRecord = createViewFeatures({
  $,
  esc,
  iconOf,
  getRecords: () => records,
  getRecord,
  deleteRecord,
  showForm,
  setCurrentId: id => {
    currentId = id;
  }
}).openRecord;

createRecordFormFeature({
  $,
  getRecords: () => records,
  setRecords: value => { records = value; },
  getEditingId: () => editingId,
  getSelectedTags: () => selectedTags,
  getSelectedRelated: () => selectedRelated,
  readSelect,
  readProperties,
  uniq,
  uid,
  getRecord,
  syncCatalogs,
  saveRecords,
  setCurrentId: value => { currentId = value; },
  openRecord: id => openRecord(id)
});

$("new-record").onclick=()=>{currentId=null;showForm()};
$("add-property").onclick=()=>addPropertyRow();
$("back").onclick=()=>{currentId=null;renderHome()};
$("cancel-top").onclick=cancelForm;$("cancel-bottom").onclick=cancelForm;
$("search").addEventListener("input",renderRecords);
$("toggle-filters").onclick=()=>{filtersOpen=!filtersOpen;updateFilterToggle()};
$("filter-category").onchange=()=>{renderFilterOptions();renderRecords();updateFilterToggle()};
$("filter-subcategory").onchange=()=>{renderRecords();updateFilterToggle()};
$("sort-records").onchange=renderRecords;
$("add-filter-condition").onclick=()=>{conditions.push({property:"",operator:"contains",value:""});renderConditionRows();renderRecords();updateFilterToggle()};
$("save-filter").onclick = saveCurrentFilter;
$("apply-saved-filter").onclick = applySelectedFilter;
$("delete-saved-filter").onclick = deleteSelectedFilter;
$("clear-filters").onclick=()=>{
 activeTypes=[];activeTags=[];conditions=[];
 $("search").value="";$("filter-category").value="";$("filter-subcategory").value="";
 $("sort-records").value="name-asc";renderHome();
};
records = loadRecords();
loadCatalogs();
savedFilters = loadStoredSavedFilters();
renderHome();
