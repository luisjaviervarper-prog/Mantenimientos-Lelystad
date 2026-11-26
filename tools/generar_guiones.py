# Paso 2: crea data/guiones/*.json, defectos.json, criterios.json e instalaciones.json.
# Ejecutar desde la raíz del repositorio después de tools/docx_a_json.py
import json, re, docx
OUT='data/'
def low(s): return s.lower()
CRIT={
 'sabon':{'aisl_bt':{'min':0.5,'txt':'≥ 0,5 MΩ a 500 V c.c. (ITC-BT-19)'},
          'tierra_neutro':{'max':37,'txt':'≤ 37 Ω (ITC-RAT 13)'},
          'tierra_herrajes':{'max':20,'txt':'Valor del proyecto; orientativo ≤ 20 Ω (ITC-RAT 13)','aviso':True},
          'nfpe':None},
 'lely':{'aisl_bt':{'min':1,'txt':'≥ 1 MΩ a 500 V c.c. (NEN 1010, cap. 6)'},
         'nfpe':{'max':12,'txt':'≤ 12 V (informes GnO)'}}
}
COMMON={'dif_ms':{'max':300,'txt':'≤ 300 ms a IΔn (EN 61008/61009)'},
        'dif_ma':{'min':15,'max':30,'txt':'Entre 0,5 y 1 × IΔn (15–30 mA para 30 mA)'},
        'cont':{'max':2,'txt':'< 2 Ω'},
        'autonomia':{'min':60,'txt':'≥ 60 min'},
        'cont_toma':{'max':2,'txt':'< 2 Ω'}}
def med_fields(step, it, inst):
    t=low(step['texto']); det=it.get('det',''); n=it.get('n',1)
    C=dict(COMMON); C.update({k:v for k,v in CRIT[inst].items() if v})
    def F(label,unidad,crit=None,tipo='num'):
        f={'label':label,'unidad':unidad,'tipo':tipo}
        if crit and crit in C: f['crit']=crit
        return f
    if det=='hora': return [F('Hora','','', 'hora')]
    if det.startswith('°C') and 'aislamiento' in t: return [F('Temperatura ambiente','°C')]
    if 'aislamiento at' in t: return [F('AT–BT','GΩ'),F('AT–Tierra','GΩ'),F('BT–Tierra','GΩ')]
    if 'termograf' in t: return [F('Temperatura máxima','°C'),F('Temperatura de referencia','°C')]
    if 'corrientes' in t: return [F('L1','A'),F('L2','A'),F('L3','A'),F('N','A')]
    if 'impedancia de bucle' in t: return [F('Zs cabecera','Ω'),F('Zs circuito final más lejano','Ω')]
    if 'diferencial' in t and 'ma' in low(det): return [F('Tiempo de disparo a IΔn','ms',crit='dif_ms'),F('Corriente de disparo','mA',crit='dif_ma')]
    if 'diferencial' in t: return [F('Tiempo de disparo a IΔn','ms',crit='dif_ms')]
    if 'tomas' in t and 'v, ω' in low(det): return [F('Tensión','V'),F('Continuidad de tierra','Ω',crit='cont_toma'),F('Polaridad','', tipo='okko')]
    if 'aislamiento de las líneas' in t or 'megado' in t: return [F('Aislamiento','MΩ',crit='aisl_bt')]
    if 'continuidad de los conductores' in t: return [F('Continuidad','Ω',crit='cont')]
    if 'neutro y conductor de protección' in t: return [F('Tensión N–PE','V',crit='nfpe')]
    if 'autonom' in t or 'ensayo de duración' in t: return [F('Autonomía','min',crit='autonomia')]
    if 'tierra de herrajes' in t: return [F('Resistencia','Ω',crit='tierra_herrajes')]
    if 'tierra de neutro' in t: return [F('Resistencia','Ω',crit='tierra_neutro')]
    if 'contadores de maniobras' in t: return [F('Nº de maniobras','nº')]
    if 'luminarias' in t: return [F('Luminarias KO','nº')]
    if 'paso y contacto' in t: return [F('Tensión de paso','V'),F('Tensión de contacto','V')]
    unit={'°C':'°C','°C máx.':'°C','Ω':'Ω','V':'V','min':'min','GΩ':'GΩ','MΩ':'MΩ','A':'A','nº':'nº'}.get(det, det or '')
    lab={'°C':'Temperatura','V':'Tensión','Ω':'Resistencia'}.get(unit,'Valor')
    return [F(lab,unit)]
def sel(step,it,inst,rol_hint):
    t=low(step['texto']); d=it.get('det','')
    if 'resultado global' in t: return {'t':'SEL','rol':'resultado','opciones':['FAVORABLE','CONDICIONADO','DESFAVORABLE']}
    if 'con corte' in t and ('decisión' in t or '¿se interviene' in t) : return {'t':'SEL','rol':'corte','opciones':['Con corte','Sin corte']}
    if 'equipo' in t: return {'t':'SEL','fuente':'equipos','multi':True}
    if 'seleccionar celda' in t: return {'t':'SEL','label':'Función de la celda','opciones':['Línea','Protección','Interruptor','Medida','Remonte','Otra']}
    if 'cuadro de la lista' in t or 'escanear el cuadro' in t: return {'t':'ID','label':'Código del cuadro','qr':True}
    if 'luminaria' in t and ('seleccionar' in t): return {'t':'ID','label':'Código y modelo de la luminaria','qr':True}
    if 'iv y wv' in t: return {'t':'ROLES'}
    if 'fusibles' in t and 'calibre' in d: return {'t':'SEL','label':'Calibre del fusible (A)','libre':True,'opciones':['6,3','10','16','20','25','31,5','40','50','63','80','100','125']}
    if 'fusibles' in t: return {'t':'SEL','label':'Calibre de fusibles / ajustes del relé','libre':True,'opciones':[]}
    if 'regulador' in t: return {'t':'SEL','label':'Toma del regulador','opciones':['1','2','3','4','5']}
    if 'corriente de ensayo' in d: return {'t':'SEL','label':'Corriente de ensayo','opciones':['Normal (sin disparo)','15 mA (disparo aguas arriba)']}
    return {'t':'SEL','libre':True,'opciones':[]}
def build(raw, inst, gid, tipo):
    g=raw; fases=[]
    for ph in g['fases']:
        pasos=[]
        for i,s in enumerate(ph['pasos']):
            t=low(s['texto']); campos=[]
            if t.startswith('si hay defecto') or t.startswith('defectos'):
                campos=[{'t':'DEFECTOS'}]
            elif 'resumen' in t and ('automático' in t or 'la app lo calcula' in t):
                campos=[{'t':'RESUMEN'}]
            elif 'lmra' in t:
                campos=[{'t':'LMRA'},{'t':'FIRMA','quien':['Equipo de trabajo']}]
            else:
              for it in s['tipos']:
                k=it['t']
                if k=='MED':
                    nota=re.sub(r'^×\s*\d\s*;?\s*','',it.get('nota','')).strip()
                    campos.append({'t':'MED','campos':med_fields(s,it,inst),**({'nota':nota} if nota else {}),**({'multi':True} if re.search(r'por (diferencial|línea|toma|punto)',it.get('nota','')+' '+it.get('det','')) else {})})
                elif k=='SEL':
                    x=sel(s,it,inst,None)
                    if x['t']=='ROLES' and 'designación' in t: campos.append(x); continue
                    campos.append(x)
                elif k=='FOTO':
                    f={'t':'FOTO','n':it.get('n',1)}
                    if 'térmica' in it.get('det','') or 'térmica' in it.get('nota',''): f['termica']=True
                    if it.get('nota'): f['nota']=it['nota'].replace('× 2','').strip(' ;') or None
                    if not f.get('nota'): f.pop('nota',None)
                    campos.append(f)
                elif k=='FIRMA':
                    quien=['Técnico']
                    if 'responsable del cliente' in t: quien=['Técnico','Responsable del cliente (si está presente)']
                    if 'wv' in t: quien=['WV (responsable del trabajo)']
                    campos.append({'t':'FIRMA','quien':quien})
                else:
                    c={'t':k}
                    if it.get('nota'): c['nota']=it['nota']
                    if it.get('det'): c['det']=it['det']
                    campos.append(c)
            p={'id':f"F{ph['n']}.{i+1}",'texto':s['texto'],'campos':campos}
            if s.get('seccion'):
                p['seccion']=s['seccion']
                if low(s['seccion']).startswith('con corte'): p['cond']='corte'
            if 'si hubo corte' in t: p['cond']='corte'
            if 'si no se puede disparar' in str(s['tipos']): pass
            pasos.append(p)
        rep=ph['repetir']
        rep={'celda':'celda','cuadro':'cuadro','trafo':'trafo','luminaria':'luminaria'}.get(rep,None)
        fases.append({'n':ph['n'],'titulo':ph['titulo'],'repetir':rep,'pasos':pasos})
    return {'id':gid,'tipo':tipo,'titulo':g['titulo'].split('–',1)[1].strip(),'intro':g['intro'].strip(),'fases':fases}
sab=json.load(open('tools/tmp_sabon.json')); lel=json.load(open('tools/tmp_lelystad.json'))
sab_reg=[r for r in sab['reglas'] if not re.match(r'(Muy grave|Grave|Leve):',r)]
G=[(sab['guiones'][0],'sabon','sabon-laracha-mt','MT'),(sab['guiones'][1],'sabon','sabon-laracha-bt','BT'),
   (lel['guiones'][0],'lely','lelystad-mt','MT'),(lel['guiones'][1],'lely','lelystad-bt','BT')]
for raw,inst,gid,tipo in G:
    g=build(raw,inst,gid,tipo)
    g['reglas']=sab_reg if inst=='sabon' else lel['reglas']
    json.dump(g,open(OUT+'guiones/'+gid+'.json','w'),ensure_ascii=False,indent=1)
# criterios
crit={}
for k,v in COMMON.items(): crit[k]=v
crit={'comun':COMMON,'sabon':{k:v for k,v in CRIT['sabon'].items() if v},'lelystad':{k:v for k,v in CRIT['lely'].items() if v},
 'termografia':{'ok':10,'medio':30,'txt':'ΔT < 10 °C correcto; 10–30 °C leve (clase C); > 30 °C grave (clase B)'},
 'desequilibrio':{'max':20,'txt':'≤ 20 %; alerta si alguna fase supera el 80 % del calibre'}}
# reference tables
def tables(path):
    d=docx.Document(path); out=[]
    for t in d.tables: out.append([[c.text.strip() for c in r.cells] for r in t.rows])
    return out
ts=tables('docs/Guiones de mantenimiento MT y BT – Sabón y Laracha.docx')
tl=tables('docs/Guiones de mantenimiento MT y BT – Lelystad.docx')
def find(tb,head):
    for t in tb:
        if t[0][0]==head and (len(t[0])>1): yield t
sab_crit=[t for t in ts if t[0][0]=='Medida'][0]; lel_crit=[t for t in tl if t[0][0]=='Medida'][0]
crit['tabla_sabon']=sab_crit; crit['tabla_lelystad']=lel_crit
json.dump(crit,open(OUT+'criterios.json','w'),ensure_ascii=False,indent=1)
sab_def=[t for t in ts if t[0][0]=='Código' and 'Gravedad por defecto' in t[0]][0]
lel_def=[t for t in tl if t[0][0]=='Código' and 'Defecto' in t[0]][0]
lel_cls=[t for t in tl if t[0][0]=='Clase'][0]
defs={'sabon':{'escala':['Muy grave','Grave','Leve'],
   'descripcion':{'Muy grave':'Riesgo inmediato para personas o instalación. Se deja sin servicio o se avisa en el momento al responsable del cliente.','Grave':'Puede provocar fallo o accidente; corregir en plazo corto (orientativo ≤ 1 mes).','Leve':'No afecta a la seguridad inmediata; corregir en el siguiente mantenimiento.'},
   'catalogo':[{'codigo':r[0],'texto':r[1],'guion':r[2],'gravedad':r[3]} for r in sab_def[1:]]},
 'lelystad':{'escala':['A','B','C','D'],
   'descripcion':{r[0]:f'{r[1]} · Plazo: {r[2]} · Equivale a {r[3]}' for r in lel_cls[1:]},
   'catalogo':[{'codigo':r[0],'texto':r[1],'guion':r[2],'gravedad':r[3],'casosGnO':r[4]} for r in lel_def[1:]]}}
json.dump(defs,open(OUT+'defectos.json','w'),ensure_ascii=False,indent=1)
alcance=[t for t in tl if t[0][0]=='Bloque'][0]
inst={'instalaciones':[
 {'id':'sabon','nombre':'Sabón','pais':'ES','perfil':'sabon','guiones':['sabon-laracha-mt','sabon-laracha-bt'],
  'centrosMT':['CT A','CT B','CT C','CT D','CT E','CT F','CT G','CT H','CT I','CT J','CT K','CT 1','CT 2','CT 3','CT FV Zara.com','Centro de Entrega','Aerogenerador'],'zonasBT':[]},
 {'id':'laracha','nombre':'Laracha','pais':'ES','perfil':'sabon','guiones':['sabon-laracha-mt','sabon-laracha-bt'],
  'centrosMT':['CT A','CT B','CT Nave','CT FV'],'zonasBT':[]},
 {'id':'lelystad','nombre':'Lelystad','pais':'NL','perfil':'lelystad','cliente':'GXO','guiones':['lelystad-mt','lelystad-bt'],
  'centrosMT':['Centro de Entrega','Central de Emergencia','TS 01','TS 03','TS 04','TS 06','TS 07','TS 09','TS 10','TS 11','TS 12','TS 13','TS 14','TS IF1 Plancha','TS IF2 Plancha','TS IF2 Plancha FV'],
  'zonasBT':['A1','A2','B1','B2','Sector B','Nave Plancha I','Nave Plancha II','Silos','Oficinas y comedor','Central térmica','General/distribución','Otros'],
  'alcance':alcance}]}
json.dump(inst,open(OUT+'instalaciones.json','w'),ensure_ascii=False,indent=1)
print('ok')
