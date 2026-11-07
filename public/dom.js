export function morph(a,b){
 const ac=[...a.childNodes],bc=[...b.childNodes];bc.forEach((y,i)=>{const x=ac[i];if(!x){a.appendChild(y);return;}
 if(x.nodeType!==y.nodeType||x.nodeName!==y.nodeName||(x.nodeType===1&&x.dataset.k!==y.dataset.k)){a.replaceChild(y,x);return;}
 if(x.nodeType!==1){if(x.nodeValue!==y.nodeValue)x.nodeValue=y.nodeValue;return;}
 for(const at of [...x.attributes])if(!y.hasAttribute(at.name))x.removeAttribute(at.name);
 for(const at of [...y.attributes])if(x.getAttribute(at.name)!==at.value)x.setAttribute(at.name,at.value);
 if(x.tagName==='INPUT'||x.tagName==='TEXTAREA'){if(x!==document.activeElement)x.value=y.value;if(x.type==='checkbox')x.checked=y.checked;return;}
 morph(x,y);if(x.tagName==='SELECT'&&x!==document.activeElement)x.value=y.value;
 });while(a.childNodes.length>bc.length)a.lastChild.remove();
}

export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
