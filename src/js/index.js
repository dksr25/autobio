var container;
var camera, scene, renderer;
var uniforms;
var startTime;

init();
animate();



function init() {
  container = document.getElementById( 'flow' );
  startTime = Date.now();
  camera = new THREE.Camera();
  camera.position.z = 1;
  scene = new THREE.Scene();
  var geometry = new THREE.PlaneBufferGeometry(2, 2 );
  uniforms = {
    iGlobalTime: { type: "f", value: 1.0 },
    iResolution: { type: "v1", value: new THREE.Vector2(), },
    iscroll: {type: "f", value: 1.0}
  };


  var material = new THREE.ShaderMaterial( {
    uniforms: uniforms,
    vertexShader: `
      varying vec2 vUv; 
      void main() {
        vUv = uv;
    
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec2 iResolution;
      uniform float iGlobalTime;
      uniform float iscroll;

      varying vec2 vUv; 

      void main(void) {
        float time=iGlobalTime*0.6;
        float scr=iscroll*0.02;
        vec2 uv = (-1.0 + 2.0 *vUv)* 2.0;

        vec2 uv0=uv;
        float i0=1.4;
        float i1=1.9;
        float i2=1.4;
        float i4=0.6;

        for(int s=0;s<20;s++) {
          vec2 r;
          
          r=vec2(cos(uv.y*i0-i4+time/i1),sin(uv.x*i0-i4+time/i1))/i2;
          
          r+=vec2(-r.y,r.x)*0.3;
          
          uv.xy+=r-0.5;
          
          i0*=1.4;
          
          i1*=0.7;
          
          i2*=1.7;
          
          i4+=0.65+0.5*time*i1;
        }
        
        float a=scr;
        float r=sin(uv.y-a*10.0)*(0.5*a+0.3)+0.1;
        float g=sin(uv.y+a*10.0)*(a+0.3)+0.1;
        float b=sin(uv.y+a*10.0)*(-1.0*a+0.3)+0.3;
     
        gl_FragColor = vec4(r,g,b,1.0);
      }
    `
  });

  var mesh = new THREE.Mesh( geometry, material );
  scene.add( mesh );
  renderer = new THREE.WebGLRenderer();
  container.appendChild( renderer.domElement );
  onWindowResize();
  window.addEventListener( 'resize', onWindowResize, false );
}

function onWindowResize( event ) {
  uniforms.iResolution.value.x = window.innerWidth;
  uniforms.iResolution.value.y = window.innerHeight;
  renderer.setSize( window.innerWidth, window.innerHeight );
}
function animate() {
  requestAnimationFrame( animate );
  render();
}

function render() {
  var currentTime = Date.now();
  var elmnt = document.getElementById("html");
  var scroll = elmnt.scrollTop;
  //console.log(scroll);

  // uniforms.iGlobalTime.value = (currentTime - startTime) * 0.001 - scroll * 0.003;
  uniforms.iGlobalTime.value = (currentTime - startTime) * 0.001 - scroll * 0.01;
  uniforms.iscroll.value = scroll * 0.003;
  renderer.render( scene, camera );
  
}