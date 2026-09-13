/* The scoring rules, as one pure module. The tool's scoreEntry() and its
   helpers, verbatim, with two changes: the refinement set (the "not needed"
   layer) is PASSED IN rather than read from a global store, and everything is
   exported. The caseload summary, every stage page and the tool must agree,
   and they agree because they run this. Dates use local time exactly as the
   tool does. No DOM, no database. */
import { INDICATORS, MODERATION, SV_DUE_WINDOW, SV_RENEWAL_WINDOW } from './frameworkData';
import { COMPLETENESS } from './framework';

let REF = {};
function isRemoved(id){ const r = REF[id]; return !!(r && r.notNeeded); }
/* Run fn with a refinement set in force - the way the tool's globals worked, made explicit. */
export function withRefinements(refinements, fn){ const prev = REF; REF = refinements || {}; try { return fn(); } finally { REF = prev; } }
/* The one everyone calls: the caseload summary for a document under a refinement set. */
export function summarise(doc, refinements){ return withRefinements(refinements, () => scoreEntry(doc)); }

export function blendedDerived(modes){
  return ((modes&&modes.el?1:0)+(modes&&modes.lo?1:0)+(modes&&modes.f2f?1:0))>=2;
}

export function applicableIn(ind,s){
  var ci=s.caseInfo||{};
  if(ind.mode==='bl')return blendedDerived(ci.modes);
  if(ind.mode)return !!(ci.modes&&ci.modes[ind.mode]);
  if(ind.cond==='assess')return !!ci.assess;
  if(ind.cond==='cert')return !!ci.cert;
  return true;
}

export function scoreEntry(s){
  var gT=0,gM=0,gF=0,gBlank=0,pAvail=0,pGot=0,ans=0,app=0,na=0,gUnnoticed=0,perStage={};
  INDICATORS.forEach(function(ind){
    if(isRemoved(ind.id))return;
    var d=(s.indicators&&s.indicators[ind.id])||{};
    if(!applicableIn(ind,s)){na++;return;}
    app++;
    var v=d.r||'';
    if(v)ans++;
    var sg=perStage[ind.st]||(perStage[ind.st]={total:0,judged:0,fail:0,failNoNotice:0});
    sg.total++; if(v)sg.judged++;
    if(ind.m){
      gT++;
      if(v==='Met')gM++;
      else if(v==='Not met'){gF++;sg.fail++;var nt=(s.notices||{})[ind.id];if(!(nt&&nt.contactedAt)){gUnnoticed++;sg.failNoNotice++;}}
      else gBlank++;
    }else if(v==='N/A'){na++;}
    else{pAvail+=2;if(v==='Met')pGot+=2;else if(v==='Partially met')pGot+=1;}
  });
  var pct=pAvail?Math.round(pGot/pAvail*100):0;
  var fullyJudged=(app>0&&ans===app&&gBlank===0);
  function stageInd(st){var sg=perStage[st];if(!sg||!sg.total)return ans>0?'pass':'';if(sg.fail>0)return sg.failNoNotice>0?'act':'sent';if(sg.judged===sg.total)return 'pass';return '';}
  var st={};
  st[1]=stage1Status(s.completeness,s.caseInfo,s.returns);
  var s1open=(st[1]!=='pass');
  st[2]=stageInd(2);st[3]=stageInd(3);st[4]=stageInd(4);
  st[5]=moderationStatus(s.moderation);
  var subFail=gF>0?(gUnnoticed>0?'act':'sent'):null;
  st[6]=s1open?'':(subFail||(fullyJudged?'pass':''));
  st[7]=s1open?'':(subFail||((fullyJudged&&pct>=70)?'pass':''));
  st[8]=surveillanceStageStatus(s);
  var verdict,vcls,di=deferralInfo(s);
  if(st[1]==='act'||st[1]==='sent'){
    /* incomplete submission: its own outcome - returned, not failed, not 'in progress'.
       Assessment has not begun, whatever ratings may already be on file. */
    var ri=stage1ReturnInfo(s);
    if(st[1]==='sent'){verdict='Returned · with provider';vcls='warn';}
    else if(ri.provider.length){verdict='Returned · '+ri.pending.length+' to send';vcls='bad';}
    else{verdict='Incomplete · scheme-side';vcls='bad';}
  }
  else if(ans===0){verdict='Not started';vcls='idle';}
  else if(s1open){verdict='Incomplete · Stage 1 open';vcls='bad';} /* rated before completeness was confirmed (import / pre-lock) */
  else if(gF>0||(di&&di.expired)){
    /* the deferral clock decides the words: expired -> refuse; re-checked and still failing -> refuse;
       running -> deferred with the days; no record yet -> held pending the provider notices */
    if(di&&di.expired){verdict='Refused · fix window expired';vcls='bad';}
    else if(di&&di.rechecked){verdict='Refused · gates after deferral';vcls='bad';}
    else if(di){verdict='Deferred · '+(di.resubmitted?'re-check':(di.daysLeft+'d left'));vcls='warn';}
    else{verdict=gUnnoticed>0?('Held · '+gUnnoticed+' to contact'):'Held · with provider';vcls=gUnnoticed>0?'bad':'warn';}
  }
  else if(!fullyJudged){verdict='In progress';vcls='idle';}
  else if(pct>=85){verdict='Accredited';vcls='ok';}
  else if(pct>=70){verdict='Accredited w/ conditions';vcls='warn';}
  else{verdict='Refused on points';vcls='bad';}
  /* the signed decision overlays the computed one: identical -> signed; different -> drifted.
     What was issued keys on the signature; the arithmetic moving afterwards is a flag, never
     a silent change to the record. Stage 7 is complete only when the signature stands. */
  var computed=verdict,dec=s.decision,signed=!!(dec&&dec.verdict),drift=false;
  if(signed){drift=(dec.verdict!==computed||dec.pct!==pct);if(drift){verdict=dec.verdict+' · drifted';vcls='bad';}}
  st[7]=s1open?'':(subFail||((signed&&!drift)?'pass':''));
  /* conditions: an unmet one is the suspension route and outranks everything; an overdue open
     one is a warning. Neither changes the computed or signed verdict - they are added to the label. */
  var cinfo=conditionsInfo(s);
  if(cinfo.unmet.length){verdict+=' · '+cinfo.unmet.length+' condition'+(cinfo.unmet.length===1?'':'s')+' unmet';vcls='bad';}
  else if(cinfo.overdue.length){verdict+=' · condition overdue';if(vcls!=='bad')vcls='warn';}
  return {gT:gT,gM:gM,gF:gF,pct:pct,ans:ans,app:app,gUnnoticed:gUnnoticed,fullyJudged:fullyJudged,stages:st,verdict:verdict,vcls:vcls,computed:computed,signed:signed,drift:drift,deferral:di,conditions:cinfo};
}

export function modVal(m){return (m&&typeof m==='object')?(m.v||''):(m===true?'approve':'');}

export function moderationStatus(mod){
  var anyPush=false,allApproved=true,any=false;
  MODERATION.forEach(function(it){
    if(isRemoved(it[0]))return;
    any=true;
    var v=modVal(mod&&mod[it[0]]);
    if(v==='pushback')anyPush=true;
    if(v!=='approve')allApproved=false;
  });
  if(!any)return 'pass';
  return allApproved?'pass':(anyPush?'act':'');
}

export function isoDate(d){var x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}

export function deferralInfo(s){
  var d=s&&s.deferral;if(!d||!d.issuedAt)return null;
  var due=new Date(d.due+'T23:59:59');
  if(isNaN(due.getTime()))return null;
  var stop=d.resubmittedAt?new Date(d.resubmittedAt):new Date();
  var daysLeft=Math.floor((due-stop)/86400000); /* whole days; 0 on the due day, negative the moment it ends */
  return {rec:d,due:due,daysLeft:daysLeft,expired:!d.resubmittedAt&&daysLeft<0,resubmitted:!!d.resubmittedAt,rechecked:!!d.recheckedAt};
}

export function conditionsInfo(s){
  var list=(s&&Array.isArray(s.conditions))?s.conditions:[];
  var today=isoDate(new Date());
  var open=list.filter(function(c){return c.status==='open';});
  return {all:list,open:open,unmet:list.filter(function(c){return c.status==='unmet';}),met:list.filter(function(c){return c.status==='met';}),
    overdue:open.filter(function(c){return c.due&&c.due<today;})};
}

export function parseLongDate(str){
  /* primary format is fmtDate()/formatDateLong() output: "10 July 2026" */
  if(!str)return null;
  var m=/^\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/.exec(str);
  if(m){
    var months=['january','february','march','april','may','june','july','august','september','october','november','december'];
    var mi=months.indexOf(m[2].toLowerCase());
    if(mi>=0){var d=new Date(parseInt(m[3],10),mi,parseInt(m[1],10));if(!isNaN(d.getTime()))return d;}
  }
  var d2=new Date(str);
  return isNaN(d2.getTime())?null:d2;
}

export function daysUntil(d){
  var t=new Date();t.setHours(0,0,0,0);
  var dd=new Date(d);dd.setHours(0,0,0,0);
  return Math.round((dd-t)/86400000);
}

export function surveillanceDates(s){
  var o=(s&&s.outcome)||{};
  var acc=parseLongDate(o.accDate)||(o.approvedAt?new Date(o.approvedAt):null);
  if(!acc||isNaN(acc.getTime()))return null;
  var sv1=new Date(acc);sv1.setFullYear(sv1.getFullYear()+1);
  var sv2=new Date(acc);sv2.setFullYear(sv2.getFullYear()+2);
  var exp=parseLongDate(o.expDate);
  if(!exp){exp=new Date(acc);exp.setFullYear(exp.getFullYear()+3);exp.setDate(exp.getDate()-1);}
  return {acc:acc,sv1:sv1,sv2:sv2,exp:exp};
}

export function svDone(v){return !!(v&&v.outcome);}

export function surveillanceInfo(s){
  var d=surveillanceDates(s);
  if(!d)return null;
  var sv=s.surveillance||{};
  var visits=[{key:'sv1',name:'Year-1 surveillance',due:d.sv1},{key:'sv2',name:'Year-2 surveillance',due:d.sv2}];
  for(var i=0;i<visits.length;i++){
    var v=visits[i];
    if(svDone(sv[v.key]))continue;
    var days=daysUntil(v.due);
    if(days<0)return {flag:'overdue',what:v.name,due:v.due,days:days,
      label:v.name+' overdue by '+Math.abs(days)+' day'+(Math.abs(days)===1?'':'s')+' (was due '+fmtDate(v.due)+')',
      short:v.name.replace(' surveillance','')+' overdue '+Math.abs(days)+'d'};
    if(days<=SV_DUE_WINDOW)return {flag:'due',what:v.name,due:v.due,days:days,
      label:v.name+' due '+(days===0?'today':'in '+days+' day'+(days===1?'':'s'))+' ('+fmtDate(v.due)+')',
      short:v.name.replace(' surveillance','')+' due '+(days===0?'today':days+'d')};
    return {flag:'ok',what:v.name,due:v.due,days:days,
      label:'Next: '+v.name+' due '+fmtDate(v.due),short:v.name.replace(' surveillance','')+' '+fmtDate(v.due)};
  }
  var de=daysUntil(d.exp);
  if(de<0)return {flag:'overdue',what:'Renewal',due:d.exp,days:de,
    label:'Term EXPIRED '+fmtDate(d.exp)+' - renewal re-assessment or removal from the register',
    short:'Term expired '+Math.abs(de)+'d ago'};
  if(de<=SV_RENEWAL_WINDOW)return {flag:'due',what:'Renewal',due:d.exp,days:de,
    label:'Term expires '+(de===0?'today':'in '+de+' day'+(de===1?'':'s'))+' ('+fmtDate(d.exp)+') - renewal is a full re-assessment',
    short:'Renewal due '+(de===0?'today':de+'d')};
  return {flag:'ok',what:'Renewal',due:d.exp,days:de,
    label:'Surveillance up to date - term runs to '+fmtDate(d.exp),short:'to '+fmtDate(d.exp)};
}

export function surveillanceStageStatus(s){
  var info=surveillanceInfo(s);
  if(!info)return '';
  if(info.flag==='overdue')return 'act';
  if(info.flag==='due')return 'sent';
  var sv=s.surveillance||{};
  if(svDone(sv.sv1)&&svDone(sv.sv2))return 'pass';
  return '';
}

export function stage1Status(comp,caseInfo,returns){
  var anyNo=false,allYes=true,any=false;
  COMPLETENESS.forEach(function(it){
    if(isRemoved(it[0])||!completenessApplicable(it,caseInfo))return;
    any=true;
    var v=comp&&comp[it[0]];
    if(v==='no')anyNo=true;
    if(v!=='yes')allYes=false;
  });
  if(!any||allYes)return 'pass';
  if(!anyNo)return '';
  /* something is missing. 'sent' once every provider-side missing item is covered by a logged
     return; 'act' while one still has to be sent, or while only scheme-side items are open */
  return stage1ReturnInfo({completeness:comp,caseInfo:caseInfo,returns:returns}).sent?'sent':'act';
}

export function stage1ReturnInfo(s){
  var missing=completenessMissing(s.completeness,s.caseInfo);
  var provider=missing.filter(function(it){return completenessSide(it)==='provider';});
  var scheme=missing.filter(function(it){return completenessSide(it)==='scheme';});
  var rs=Array.isArray(s.returns)?s.returns:[];
  var last=rs.length?rs[rs.length-1]:null;
  var pending=provider.filter(function(it){return !(last&&last.items&&last.items.indexOf(it[0])>=0);});
  return {missing:missing,provider:provider,scheme:scheme,last:last,pending:pending,sent:provider.length>0&&pending.length===0};
}

export function completenessMissing(comp,caseInfo){
  return COMPLETENESS.filter(function(it){return !isRemoved(it[0])&&completenessApplicable(it,caseInfo)&&comp&&comp[it[0]]==='no';});
}

export function completenessSide(it){return it[3]==='scheme'?'scheme':'provider';}

export function completenessApplicable(it,caseInfo){
  var cond=it[2];
  if(!cond)return true;
  if(cond==='exam')return !!(caseInfo&&caseInfo.examBank);
  if(cond==='cert')return !!(caseInfo&&caseInfo.cert);
  return true;
}

export function moderationProgress(mod){
  var tot=0,done=0;
  MODERATION.forEach(function(it){if(isRemoved(it[0]))return;tot++;if(modVal(mod&&mod[it[0]])!=='')done++;});
  return tot?done/tot:0;
}

export function stage1Progress(comp,caseInfo){
  var tot=0,done=0;
  COMPLETENESS.forEach(function(it){if(isRemoved(it[0])||!completenessApplicable(it,caseInfo))return;tot++;var v=comp&&comp[it[0]];if(v==='yes'||v==='no')done++;});
  return tot?done/tot:0;
}

export function formatDateLong(d){
  var mo=['January','February','March','April','May','June','July','August','September','October','November','December'];
  return d.getDate()+' '+mo[d.getMonth()]+' '+d.getFullYear();
}

export function fmtDate(d){
  var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  return d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear();
}
