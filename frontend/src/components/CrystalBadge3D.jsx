import React, { useEffect, useRef, useState } from 'react';
import {ALL_3D_BADGES} from '../utils/benchBadgeAssets';
import {clubMissionBadgeId} from '../utils/clubMissionBadgeAssets';

export default function CrystalBadge3D({ weight=40, badgeId:requestedBadgeId=`bench_${weight}`, tier, image=`/images/badges/3d/bench_${weight}.png`, name=`臥推 ${weight} 公斤`, unlocked=true, celebrate=false, onReady }) {
    const badgeId=clubMissionBadgeId(requestedBadgeId,tier||image.match(/_(bronze|silver|gold|platinum)\.png$/)?.[1]||'bronze')||requestedBadgeId;
    const host=useRef(null);
    const readyCallback=useRef(onReady);readyCallback.current=onReady;
    const entry=ALL_3D_BADGES[badgeId];
    const [status,setStatus]=useState('loading');
    useEffect(()=>{
        const element=host.current;if(!element)return;
        let disposed=false,cleanup=()=>{};
        setStatus('loading');
        (async()=>{
            const [THREE,{RoomEnvironment},{createStrengthBadge,disposeBadge},{createBadgeStudio},{createBadgeParticles}]=await Promise.all([
                import('three'),import('three/addons/environments/RoomEnvironment.js'),import('../three/crystalBadge'),import('../three/badgeStudio.js'),import('../three/badgeParticles.js')]);
            if(disposed)return;
            const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
            let pmrem,environment,model,observer,particles,intersection,reduced,seasonalShadow,frame=0;
            const stop=()=>{cancelAnimationFrame(frame);frame=0;};
            const onLoss=e=>{e.preventDefault();stop();setStatus('fallback');};
            cleanup=()=>{stop();observer?.disconnect();intersection?.disconnect();reduced?.removeEventListener('change',onVisibility);particles?.dispose();document.removeEventListener('visibilitychange',onVisibility);element.removeEventListener('keydown',onKey);element.removeEventListener('pointerdown',onDown);element.removeEventListener('pointermove',onMove);element.removeEventListener('pointerup',onUp);element.removeEventListener('pointercancel',onUp);element.removeEventListener('lostpointercapture',onUp);renderer.domElement.removeEventListener('webglcontextlost',onLoss);if(model)disposeBadge(model);seasonalShadow?.dispose();environment?.dispose();pmrem?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
            const studioLighting=/^(km_|photo_|pace_|run_count_|partner_|q_|mission_|season_)/.test(badgeId)||entry?.family==='nutrition';
            renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=studioLighting?.85:.65;
            renderer.domElement.setAttribute('aria-hidden','true');renderer.domElement.style.cssText='width:100%;height:100%;display:block;pointer-events:none';
            if(entry?.index===0&&!['cardio','nutrition','community','intimacy','quarterly','club-mission'].includes(entry.family)) renderer.domElement.style.filter='drop-shadow(0 0 5px rgba(255,250,237,.75)) drop-shadow(0 0 15px rgba(255,240,219,.42)) drop-shadow(0 0 28px rgba(245,204,214,.24))';
            element.appendChild(renderer.domElement);
            const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,30);camera.position.set(0,0,5.4);
            pmrem=new THREE.PMREMGenerator(renderer);const room=studioLighting?createBadgeStudio():new RoomEnvironment();environment=pmrem.fromScene(room,.04);room.dispose();scene.environment=environment.texture;scene.environmentIntensity=studioLighting?.85:.5;pmrem.dispose();pmrem=null;
            scene.add(new THREE.HemisphereLight(0xffffff,0x392c38,0.25));
            const light=new THREE.DirectionalLight(0xffe9db,1.2);light.position.set(-3,4,5);scene.add(light);
            const pearlFill=new THREE.DirectionalLight(0xcbb8ff,1.1);pearlFill.position.set(3,-1,3);scene.add(pearlFill);
            const rim=new THREE.DirectionalLight(0xd9eaff,3);rim.position.set(3,1,-2);scene.add(rim);
            model=createStrengthBadge(badgeId);scene.add(model);model.rotation.set(-.07,-.22,0);
            if(badgeId.startsWith('season_')){
                renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
                light.castShadow=true;seasonalShadow=light.shadow;light.shadow.intensity=.48;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-2;light.shadow.camera.right=2;light.shadow.camera.top=2;light.shadow.camera.bottom=-2;light.shadow.camera.near=.1;light.shadow.camera.far=15;light.shadow.normalBias=.008;light.shadow.bias=-.00015;
                model.traverse(o=>{if(o.isMesh){o.castShadow=!o.material.transparent&&o.name!=='DRVN_reverse_signature';o.receiveShadow=true;}});
            }
            let yaw=-.22,pitch=-.07,drag=null,last=0,visible=true,needsFrame=true,revealStart=null;
            reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
            particles=createBadgeParticles(badgeId,{celebrate});if(particles)scene.add(particles.points);
            reduced.addEventListener('change',onVisibility);
            const render=now=>{
                frame=0;if(disposed||document.hidden||!visible)return;
                if(now-last>=32||needsFrame){last=now;needsFrame=false;
                    const blend=reduced.matches?1:.16;
                    const progress=revealStart===null?1:Math.min(1,(now-revealStart)/4800);
                    if(celebrate&&!reduced.matches&&progress<1){const t=progress*progress*(3-2*progress);yaw=-.22+t*Math.PI*2;model.rotation.y=yaw;}
                    else if(celebrate&&revealStart!==null&&!reduced.matches)yaw=-.22+Math.PI*2;
                    model.rotation.y+=(yaw-model.rotation.y)*blend;model.rotation.x+=(pitch-model.rotation.x)*blend;
                    const moving=Math.abs(yaw-model.rotation.y)+Math.abs(pitch-model.rotation.x)>.002;
                    if(particles){particles.points.visible=!reduced.matches;particles.update(now*.001);}
                    renderer.render(scene,camera);
                    if(!moving&&!drag&&(!particles||reduced.matches)&&(!celebrate||progress>=1||reduced.matches))return;
                }
                frame=requestAnimationFrame(render);
            };
            const wake=()=>{needsFrame=true;if(!frame)frame=requestAnimationFrame(render);};
            function onDown(e){if(e.button!==0)return;e.preventDefault();drag={x:e.clientX,y:e.clientY,yaw,pitch};element.setPointerCapture(e.pointerId);wake();}
            function onMove(e){if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.015;pitch=Math.max(-.65,Math.min(.65,drag.pitch+(e.clientY-drag.y)*.009));wake();}
            function onUp(){drag=null;wake();}
            function onKey(e){if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();if(e.key==='Home'){yaw=-.22;pitch=-.07;}else if(e.key==='End'){yaw=Math.abs(Math.cos(yaw)+1)<.1?-.22:Math.PI;pitch=-.07;}else if(e.key==='ArrowLeft')yaw-=.25;else if(e.key==='ArrowRight')yaw+=.25;else pitch=Math.max(-.65,Math.min(.65,pitch+(e.key==='ArrowUp'?-.15:.15)));wake();}
            function onVisibility(){if(document.hidden)stop();else wake();}
            element.addEventListener('pointerdown',onDown);element.addEventListener('pointermove',onMove);element.addEventListener('pointerup',onUp);element.addEventListener('pointercancel',onUp);element.addEventListener('lostpointercapture',onUp);element.addEventListener('keydown',onKey);document.addEventListener('visibilitychange',onVisibility);renderer.domElement.addEventListener('webglcontextlost',onLoss);
            observer=new ResizeObserver(()=>{const {width,height}=element.getBoundingClientRect();visible=width>0&&height>0;if(visible){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();wake();}});observer.observe(element);
            intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)wake();else stop();});intersection.observe(element);
            if(model.artworkReady)await model.artworkReady;
            if(disposed)return;
            revealStart=performance.now();readyCallback.current?.();
            renderer.render(scene,camera);setStatus('ready');wake();
        })().catch(()=>{cleanup();if(!disposed){setStatus('fallback');readyCallback.current?.();}});
        return()=>{disposed=true;cleanup();};
    },[badgeId,celebrate]);
    return <div style={{position:'relative',width:'100%',height:'100%',filter:unlocked?'none':'grayscale(1) opacity(.4)'}}>
        {status!=='ready'&&<img src={image} alt={name} style={{width:'100%',height:'100%',objectFit:'contain'}}/>}
        <div ref={host} role="img" aria-label={`${name}，3D 水晶徽章。拖曳或方向鍵旋轉，Home 鍵復位，End 鍵翻面。`} tabIndex={status==='ready'?0:-1} style={{position:'absolute',inset:0,visibility:status==='ready'?'visible':'hidden',touchAction:'none',userSelect:'none',cursor:status==='ready'?'grab':'default',outlineOffset:2}}/>
        <button type="button" aria-label="翻面查看品牌印記" onClick={()=>host.current?.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))} style={{position:'absolute',top:8,right:8,border:'1px solid #b9afa244',borderRadius:14,padding:'6px 10px',background:'#24211dcc',color:'#ddd3c5',fontSize:11,cursor:'pointer'}}>翻面</button>
        <span role="status" style={{position:'absolute',bottom:8,left:0,right:0,textAlign:'center',fontSize:10,color:'#b9afa2',letterSpacing:'.08em'}}>{status==='loading'?'正在雕琢徽章…':status==='ready'?'拖曳旋轉 · 3D 水晶徽章':'徽章圖片預覽'}</span>
    </div>;
}
