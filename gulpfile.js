'use strict'
/*jshint -W110 */

import glob from 'glob'
import gulp from 'gulp'
import * as fs from 'fs'
import * as path from 'path'
import * as cheerio from 'cheerio'
import gitDateExtractor from 'git-date-extractor'
import getRepoInfo from 'git-repo-info'
import ejs from 'gulp-ejs'
import jsbeautifier from 'gulp-jsbeautifier'
import del from 'del'
import browserSync from 'browser-sync'
import rename from 'gulp-rename'
import remember from 'gulp-remember'
import autoprefixer from 'gulp-autoprefixer'
import dartSass from 'sass'
import gulpSass from 'gulp-sass'
import Fiber from 'fibers'
import pngquant from 'gulp-pngquant'
import imagemin, {gifsicle, mozjpeg, svgo} from 'gulp-imagemin'
import cache from 'gulp-cached'
import merge from 'merge-stream'
import cleanCss from 'gulp-clean-css'
import replace from 'gulp-replace'
import ghPages from 'gulp-gh-pages'
import axeWebdriver from 'gulp-axe-webdriver'


browserSync.create()
const { src, dest, watch, series, parallel, lastRun } = gulp
const __dirname = path.resolve()
const sassCompile = gulpSass(dartSass)

const gulpConfig = {
  autoprefixer: ['> 1%', 'last 2 versions', 'iOS 10', 'Android > 80', 'Firefox ESR', 'IE 11'],
  deployMessage: '[UPDATE] deploy to gh-pages',
  src: './src',
  dist: './dist',
  // sprite-hash option
  spriteHash: true,
  // ejs-template's global variables
  ejsVars: {
  },
  outputStyle: false // 1. compressed: false, 2. expanded: 'beautify'
}


/* ===== Nomalize ===== */
function update_normalize() {
  return src([
    `./node_modules/normalize.css/normalize.css`
  ])
  .pipe(rename({
    prefix: '_',
    extname: '.scss'
  }))
  .pipe(dest(`${gulpConfig.src}/assets/styles/global`))
}

/* ===== HTML & INDEX ===== */
function process_html() {
  return src([
      `${gulpConfig.src}/pages/**/*.html`
    ])
    .pipe(ejs(gulpConfig.ejsVars))
    .pipe(jsbeautifier({
      config: '.jsbeautifyrc',
      mode: 'VERIFY_AND_WRITE'
    }))
    .pipe(dest(`${gulpConfig.dist}/pages`))
}

async function stamps(){
  await gitDateExtractor.getStamps({
    outputToFile: true,
    outputFileName: '../../timestamps.json',
    onlyIn : ['./'],
    projectRootPath: __dirname+'/src/pages'
  });
}

function make_indexfile(done) {
  let stampData = fs.readFileSync('./timestamps.json'), // stamps 에서 생성한 json 읽기
      jsonStampData = JSON.parse(stampData), // json 파일 이용가능하도록 parse
      dPath = `${gulpConfig.src}/pages/`, // index를 생성할 파일들이 있는 저장소
      normalFiles = [], // 파일 정보를 저장할 배열 생성
      ejsNormalFiles = [],
      info = getRepoInfo() // git 정보 생성

  //ejs 목록 읽고, 저장
  const ejsGlob = glob.sync(`${gulpConfig.src}/pages/components/**.ejs`)

  ejsGlob.map(function (file) {
    return file.replace(/\.\/src\/pages\//, '');
  }).forEach(function (file) {
    let ejsExtname = path.extname(file),
        ejsBasename = file,
        ejsNameText = path.basename(file);
    if(ejsExtname == '.ejs' && ejsNameText.indexOf('_') != 0) {
      let ejsFileData = {};
      //git 기준 마지막 변경 닐짜
      let ejsModifiedDate = jsonStampData[ejsBasename].modified*1000;
      //git 기준 생성 날짜
      let ejsCreatedDate = jsonStampData[ejsBasename].created*1000;
      // 객체에 데이터 집어넣기
      ejsFileData.name = ejsBasename;
      ejsFileData.mdate = new Date(ejsModifiedDate);
      ejsFileData.cdate = new Date(ejsCreatedDate);
      ejsFileData.since = ejsModifiedDate;
      ejsFileData.age = ejsCreatedDate;
      ejsFileData.ndate = ejsFileData.mdate.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' (GMT+9)';
      ejsNormalFiles.push(ejsFileData);
    }
  });

  // 파일 목록 읽고, 필요한 정보 저장
  fs.readdir(dPath, function (err, files) {
    if (err) {
      throw err;
    }
    files.map(function (file) {
      return path.join(dPath, file);
    }).filter(function (file) {
      return fs.statSync(file).isFile();
    }).forEach(function (file) {
      //HTML 파일만 거르기
      let extname = path.extname(file),
        basename = path.basename(file);
      if (extname == '.html') {

        // 일반 file info를 저장할 객체 생성
        let nfileData = {};

        // title 텍스트 값 추출
        let fileInnerText = fs.readFileSync(file, 'utf8');
        let checkresult = [];
        for(let i=0;i<ejsNormalFiles.length;i++){
          if(fileInnerText.replace(/<\!--.+?-->/sg,"").indexOf(`include('components/${ejsNormalFiles[i].name.replace('.ejs','')}'`)==-1){
            checkresult[i] = false;
          } else {
            checkresult[i] = true;
          }
        }
        let $ = cheerio.load(fileInnerText);
        let wholeTitle = $('title').text(),
        splitTitle = wholeTitle.split(' : '),
        //git 기준 마지막 변경 닐짜
        modifiedDate = jsonStampData[`${basename}`].modified*1000,
        //git 기준 생성 날짜
        createdDate = jsonStampData[`${basename}`].created*1000;

        // 객체에 데이터 집어넣기
        nfileData.title = splitTitle[0];
        nfileData.name = path.basename(file);
        nfileData.category = String(nfileData.name).substring(0, 2);
        nfileData.categoryText = splitTitle[1];
        nfileData.mdate = new Date(modifiedDate);
        nfileData.cdate = new Date(createdDate);
        nfileData.since = modifiedDate;
        nfileData.age = createdDate;
        nfileData.check = checkresult;

        // 파일수정시점 - 대한민국 표준시 기준
        nfileData.ndate = nfileData.mdate.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' (GMT+9)';

        // title 마지막 조각 , 인덱스에 붙은 라벨 식별 및 yet 인 경우 수정날짜정보 제거
        nfileData.status = splitTitle[2];
        if(typeof splitTitle[2] == 'undefined' || splitTitle[2] == null || splitTitle[2] == '') {
          nfileData.status = '';
        }
        else if(splitTitle[2] == 'yet') {
          nfileData.mdate = '';
          nfileData.ndate = '';
        }
        normalFiles.push(nfileData);

      }
    });
    let projectObj = {
      nfiles: normalFiles,
      ejsFiles: ejsNormalFiles,
      branch: info.branch
    }
    let projectObjStr = JSON.stringify(projectObj);
    let projectObjJson = JSON.parse(projectObjStr);

    //index 파일 쓰기
    return src('index.html')
      .pipe(ejs(projectObjJson))
      .pipe(dest(gulpConfig.dist))
      // .pipe(browserSync.stream())
  });
  del('./timestamps.json');
  done()
}

/* ===== SASS ===== */
function sass() {
  return src([
    `${gulpConfig.src}/styles/*.{sass,scss}`,
  ], {sourcemaps: true, since: lastRun(sass)})
    .pipe(remember())
    .pipe(sassCompile({
      fiber: Fiber,
    }).on('error', sassCompile.logError))
    .pipe(autoprefixer({
      overrideBrowserslist: gulpConfig.autoprefixer,
      remove: false,
      cascade: false
    }))
    .pipe(dest(`${gulpConfig.dist}/css`, {sourcemaps: true}))
}

/* ===== IMG (sprites, svg-sprites, png, jpeg ..) ===== */
function optimize_png() {
  return src([
    `${gulpConfig.src}/images/**/*.png`,
    `!${gulpConfig.src}/images/**/*.ani.png`,
  ])
  .pipe(cache(`optimizeImage`))
  .pipe(pngquant({
    quality: '100'
  }))
  .pipe(dest(`${gulpConfig.dist}/images`))
}

function optimize_others() {
  const optimizeFile = src([
    `${gulpConfig.src}/images/**/*.{gif,jpg,jpeg,svg,png,ico,ejs}`,
    `!${gulpConfig.src}/images/**/*.ani.png`,
  ])  
  .pipe(cache(`optimizeImage`))
  .pipe(imagemin([
    gifsicle({
      interlaced: true
    }), // gif
    mozjpeg({
      progressive: true
    }) // jpg
  ], {
    verbose: true
  }))
  .pipe(dest(`${gulpConfig.dist}/images`));

  const aniPng = src(
    `${gulpConfig.src}/img/**/*.ani.png`
  )
  .pipe(dest(`${gulpConfig.dist}/images`));

  return merge(optimizeFile, aniPng);
}

function copy_font() {
  return src([
    `${gulpConfig.src}/fonts/**/*`,
  ])
  .pipe(dest(`${gulpConfig.dist}/fonts`))
  // .pipe(browserSync.stream())
}

function copy_js() {
  return src([
    `${gulpConfig.src}/js/**/*`,
  ])
  .pipe(dest(`${gulpConfig.dist}/js`))
  // .pipe(browserSync.stream())
}

/* ===== Clean ===== */
function clean_dist() {
  return del(gulpConfig.dist)
}

function clean_html() {
  return del(`${gulpConfig.dist}/pages`)
}

function clean_css() {
  return del([
    `${gulpConfig.dist}/css/*.css`
  ])
}

function clean_font() {
  return del([
    `${gulpConfig.dist}/fonts/**/*`
  ])
}

function clean_js() {
  return del([
    `${gulpConfig.dist}/js/**/*`
  ])
}

/* =========================
  Server (BrowserSync) 
  ========================== */
function browserSyncReload (done) {
  browserSync.reload();
  done();
}

function server() {
  // serve files from the build folder
  browserSync.init({
    port: 8030,
    ui: {
      port: 8033,
      weinre: {
        port: 8133
      }
    },
    cors: false, // if you need CORS, set true
    server: {
      baseDir: `${gulpConfig.dist}/`
    }
  });

  console.log('\x1b[32m%s\x1b[0m', '[--:--:--] HTML/SCSS watch complete...');

  watch([
    `${gulpConfig.src}/pages/**/*`,
  ], series(parallel(series(clean_html, process_html), series(stamps, make_indexfile)), browserSyncReload));
  
  watch([
    `${gulpConfig.src}/images/**/*`,
  ], series(parallel(optimize_png, optimize_others), browserSyncReload));
  
  watch([
    `${gulpConfig.src}/styles/**/*.{sass,scss}`,
  ], series(clean_css, sass, browserSyncReload));
  
  watch([
    `${gulpConfig.src}/fonts/**/*`,
  ], series(clean_font, copy_font, browserSyncReload));

  watch([
    `${gulpConfig.src}/js/**/*`,
  ], series(clean_js, copy_js, browserSyncReload));
  
  watch('index.html', series(stamps, make_indexfile, browserSyncReload));
  
}

/* ==========
    Watch 
  =========== */
function markup_watch() {
  series(
    clean_dist, update_normalize,
    parallel(copy_font, copy_js, process_html, series(stamps, make_indexfile)),
    parallel(optimize_png, optimize_others), sass, server, () => {
    }
  )();
}

/**
 * CSS: watch for style auto-compile
 * @example gulp
 */
  export default markup_watch;


/* ==========
  Build 
=========== */
function process_html_in_build() {
  return src([
    `${gulpConfig.src}/pages/**/*.html`,
  ])
  .pipe(ejs(gulpConfig.ejsVars))
  .pipe(jsbeautifier({
    config: '.jsbeautifyrc',
    mode: 'VERIFY_AND_WRITE'
  }))
  .pipe(dest(`${gulpConfig.dist}/pages`))
}

function sass_in_build() {
  return src([
    `${gulpConfig.src}/styles/*.{sass,scss}`,
  ])
    .pipe(sassCompile({
      fiber: Fiber,
    }).on('error', sassCompile.logError))
    .pipe(autoprefixer({
      overrideBrowserslist: gulpConfig.autoprefixer,
      remove: false,
      cascade: false
    }))
    // .pipe(groupCssMediaQueries())
    .pipe(cleanCss({
      format: gulpConfig.outputStyle
    }))
    .pipe(replace('!important', ' !important'))
    .pipe(dest(`${gulpConfig.dist}/css`))
}

function markup_build(done) {
  series(
    clean_dist, update_normalize,
    parallel(copy_font, copy_js, process_html_in_build, series(stamps, make_indexfile)),
    parallel(optimize_png, optimize_others), sass_in_build, (done) => {
      console.log('\x1b[32m%s\x1b[0m', '[--:--:--] Build complete...')
      done()
    })()
  done()
}

/**
 * build: build for style auto-compile
 * @example gulp build
 */
  export { markup_build as build };


/* ==========
  Deploy 
=========== */
let info = getRepoInfo();

const deployMessage = () => {
  let i = proess.argv.indexOf("--message");
  return i !== -1 ? process.argv[i + 1] : false;
}

function source_deploy() {

  return src([
    `${gulpConfig.dist}/**/*`,
    `./.gitlab-ci.yml`,
    `!${gulpConfig.dist}/css/*.css.map`,
    `!${gulpConfig.dist}/rev-manifest.json`,
    ])
    .pipe(ghPages({
      branch: 'pages',
      message: gulpConfig.deployMessage,
    }))
}

function markup_deploy(done) {
  series(
    clean_dist, update_normalize,
    parallel(copy_font, copy_js, process_html_in_build, series(stamps, make_indexfile)),
    parallel(optimize_png, optimize_others), sass_in_build, source_deploy, (done) => {
      console.log('\x1b[32m%s\x1b[0m', '[--:--:--] Build & Deploy complete...')
      done()
    })()
  done()
}

/**
 * deploy: deploy for style auto-compile
 * @example gulp deploy
 */
export { markup_deploy as deploy };

/* ===========================
    axe_test 
    - accessibility check
  ============================ */
function axe_test() {
  let options = {
    headless: false,
    urls:[`${gulpConfig.dist}/html/*.html`],
    showOnlyViolations : true
  };
  return axeWebdriver(options);
}

/**
 * check: html accessibility check
 * @example gulp check
 */
export { axe_test as check }