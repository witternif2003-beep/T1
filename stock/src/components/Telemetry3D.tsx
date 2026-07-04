import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { computeP1 } from '../lib/computeP1';
import type { Stock } from '../types';

export const WebGLSupport = (() => {
  try {
    const c=document.createElement('canvas');
    const gl=c.getContext('webgl2')??c.getContext('webgl');
    if(!gl) return{ok:false,version:'none',renderer:'—'};
    const dbg=gl.getExtension('WEBGL_debug_renderer_info');
    return{ok:true,version:c.getContext('webgl2')?'WebGL2':'WebGL1',renderer:dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string:'unknown'};
  }catch{ return{ok:false,version:'error',renderer:'—'}; }
})();

const COLORS=[0x00ff88,0xffaa00,0x00f0ff,0xa855f7,0xff3366,0xff6b35] as const;

export function Telemetry3D({stocks}:{stocks:Stock[]}){
  const mountRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=mountRef.current; if(!el) return;
    if(!WebGLSupport.ok){el.innerHTML=`<div style="color:#555;font-size:.7rem;padding:1.5rem;text-align:center">WebGL not available</div>`;return;}

    const W=el.clientWidth||600,H=el.clientHeight||280;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setSize(W,H);renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    renderer.setClearColor(0x000000,0);el.appendChild(renderer.domElement);

    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(48,W/H,0.1,200);
    camera.position.set(0,9,20);camera.lookAt(0,1,0);

    scene.add(new THREE.AmbientLight(0x001133,1.5));
    const dl=new THREE.DirectionalLight(0x00ff88,0.7);dl.position.set(6,12,8);scene.add(dl);
    const dl2=new THREE.DirectionalLight(0xa855f7,0.4);dl2.position.set(-6,6,-4);scene.add(dl2);
    scene.add(new THREE.GridHelper(24,24,0x12122a,0x12122a));

    const sorted=[...stocks].sort((a,b)=>(b.volume*b.changePct)-(a.volume*a.changePct)).slice(0,6);
    const maxScore=sorted.reduce((m,s)=>Math.max(m,computeP1(s).imminentScore),1);
    const disposables:Array<THREE.BufferGeometry|THREE.Material>=[];

    sorted.forEach((stk,i)=>{
      const p1=computeP1(stk);
      const h=Math.max(0.2,(p1.imminentScore/maxScore)*7);
      const col=COLORS[i%COLORS.length];
      const x=(i-(sorted.length-1)/2)*3.5;

      const geo=new THREE.BoxGeometry(1.4,h,1.4);
      const mat=new THREE.MeshPhongMaterial({color:col,emissive:col,emissiveIntensity:0.3,transparent:true,opacity:0.85});
      const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,h/2,0);scene.add(mesh);disposables.push(geo,mat);

      // P1 needle
      const sh=Math.max(0.1,(p1.score/100)*5);
      const sgeo=new THREE.BoxGeometry(0.25,sh,0.25);
      const smat=new THREE.MeshPhongMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:0.8,transparent:true,opacity:0.55});
      const smesh=new THREE.Mesh(sgeo,smat);smesh.position.set(x,h+sh/2+0.05,0);scene.add(smesh);disposables.push(sgeo,smat);

      // Squeeze torus
      if(p1.squeezeSetup){
        const rgeo=new THREE.TorusGeometry(0.9,0.06,6,18);
        const rmat=new THREE.MeshPhongMaterial({color:0xff3366,emissive:0xff3366,emissiveIntensity:0.7,transparent:true,opacity:0.75});
        const rmesh=new THREE.Mesh(rgeo,rmat);rmesh.position.set(x,h+0.1,0);rmesh.rotation.x=Math.PI/2;scene.add(rmesh);disposables.push(rgeo,rmat);
      }
    });

    let frameId=0,angle=0;
    const animate=()=>{frameId=requestAnimationFrame(animate);angle+=0.003;camera.position.x=Math.sin(angle)*20;camera.position.z=Math.cos(angle)*20;camera.lookAt(0,2,0);renderer.render(scene,camera);};
    animate();

    const onResize=()=>{const W2=el.clientWidth,H2=el.clientHeight;if(!W2||!H2)return;camera.aspect=W2/H2;camera.updateProjectionMatrix();renderer.setSize(W2,H2);};
    window.addEventListener('resize',onResize);
    return()=>{cancelAnimationFrame(frameId);window.removeEventListener('resize',onResize);disposables.forEach(d=>d.dispose());renderer.dispose();if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);};
  },[stocks]);
  return <div ref={mountRef} className="telemetry-container"/>;
}
