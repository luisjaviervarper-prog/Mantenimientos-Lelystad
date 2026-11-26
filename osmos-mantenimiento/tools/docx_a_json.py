# Paso 1: lee un guion .docx y lo pasa a un JSON intermedio.
# Uso (desde la raíz): python3 tools/docx_a_json.py "docs/<guion>.docx" tools/tmp_<nombre>.json x
# Necesita: pip install python-docx
import docx, re, json, sys
src, out_prefix, inst = sys.argv[1], sys.argv[2], sys.argv[3]
d = docx.Document(src)
paras = [(p.style.name, p.text.strip()) for p in d.paragraphs if p.text.strip()]
CODE = r'(FOTO\*?|FOTO t[ée]rmica|MED|CINA|SI/NO|TXT|SEL|[Ff]irma|OK/KO)'
def parse_types(s):
    tipos=[]
    for part in re.split(r'\s*\+\s*|\s*/\s*(?=FOTO|CINA)', s):
        part=part.strip().rstrip('.')
        m=re.match(r'(FOTO\*|FOTO t[ée]rmica|FOTO|MED|CINA|SI/NO|TXT|SEL|[Ff]irma(?: en pantalla)?|OK/KO)(.*)', part)
        if not m: continue
        k,rest=m.group(1),m.group(2)
        n=1; mm=re.search(r'×\s*(\d)', rest)
        if mm: n=int(mm.group(1))
        t={'FOTO*':'FOTO*','MED':'MED','CINA':'CINA','SI/NO':'SINO','TXT':'TXT','SEL':'SEL','OK/KO':'OKKO'}.get(k)
        if k.startswith('FOTO t'): t='FOTO'; rest=' (térmica)'+rest
        if k.lower().startswith('firma'): t='FIRMA'
        if k=='FOTO': t='FOTO'
        item={'t':t}
        if n>1: item['n']=n
        u=re.search(r'\(([^)]*)\)', rest)
        if u: item['det']=u.group(1)
        r2=rest.strip()
        if r2 and not r2.startswith('('): item['nota']=r2.strip(' ;')
        elif u and rest[u.end():].strip(' ;'): item['nota']=rest[u.end():].strip(' ;')
        tipos.append(item)
    return tipos
def split_step(text):
    # find last sentence containing codes
    m=re.search(r'\.\s+((?:FOTO|MED|CINA|SI/NO|TXT|SEL|SEL|Firma|OK/KO)[^.]*(?:\.[^.]*)?)$', text)
    if not m:
        m=re.search(r'\s((?:FOTO|MED|CINA|SI/NO|TXT|SEL|Firma|OK/KO).*)$', text)
        if not m: return text, []
        return text[:m.start()].strip(), parse_types(m.group(1))
    return text[:m.start()+1].strip(), parse_types(m.group(1))
guiones=[]; reglas=[]; cur=None; phase=None; section=None
for style,text in paras:
    if style.startswith('Heading 2'):
        if text.startswith('Guion'):
            cur={'titulo':text,'fases':[],'intro':''}; guiones.append(cur); phase=None
        else:
            cur=None if not text.startswith('Objeto') else cur; mode=text
        continue
    if cur is None:
        if style.startswith('List'): reglas.append(text)
        continue
    m=re.match(r'Fase (\d+)\s*[–-]\s*(.*)', text)
    if m and not style.startswith('List'):
        title=m.group(2); steps=[]
        if ':' in title and not title.endswith(')'):
            t1,body=title.split(':',1)
            s,tp=split_step(body.strip())
            if tp:
                title=t1.strip(); steps.append({'texto':s[0].upper()+s[1:],'tipos':tp})
        rep=None
        rm=re.search(r'\((?:repetir por (?:cada )?|por (?=luminaria))([^)]*)\)',title)
        if rm: rep=rm.group(1).strip()
        phase={'n':int(m.group(1)),'titulo':title,'repetir':rep,'pasos':steps}; cur['fases'].append(phase); section=None
        continue
    if style.startswith('List') and phase is not None:
        s,tp=split_step(text)
        st={'texto':s,'tipos':tp}
        if section: st['seccion']=section
        phase['pasos'].append(st)
    elif phase is None:
        cur['intro']+=text+' '
    else:
        section=text
json.dump({'reglas':reglas,'guiones':guiones},open(out_prefix,'w'),ensure_ascii=False,indent=1)
