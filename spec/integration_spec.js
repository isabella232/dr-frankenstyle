import path from 'path';
import fs from 'fs-promise';
import {exec} from 'child-process-promise';
import {merge} from 'event-stream';
import {dest} from 'vinyl-fs';
import {generateProject, cleanupProject} from './helpers/dummy_project';
import {toHaveOrder, toBeAFile} from './helpers/jasmine_matchers';
import {setup, copyAssets, generateCss} from '../src/dev';
import cssFilesFromDependencies from '../src/css-files-from-dependencies';

const command = `${require.resolve('babel/bin/babel-node')} ${path.join(__dirname, '..', 'src', 'cli.js')}`;
const expectedPackages = ['tires', 'brakes', 'calipers', 'drums', 'delorean', 'mr-fusion', 'focus', 'f150', 'truck-tires', 'cowboy-hat', 'truck-bed', 'gate', 'timeTravel', '88-mph'];
const originalWorkingDirectory = process.cwd();

function cli(args = '') {
  return exec(`${command} ${args}`);
}

function readCss() {
  return fs.readFile(path.resolve('public', 'components.css'), 'utf8');
}

const dummyProjectName = 'myApp';

describe('dr-frankenstyle', function() {
  beforeEach(function() {
    jasmine.addMatchers({toHaveOrder, toBeAFile});

    generateProject(__dirname, dummyProjectName);
    process.chdir(path.resolve(__dirname, dummyProjectName));
  });

  afterEach(function() {
    cleanupProject(__dirname, dummyProjectName);
    process.chdir(originalWorkingDirectory);
  });

  describe('when called with no arguments', function() {
    it('shows an error message', function(done) {
      cli()
        .then(() => {
          throw new Error('Expected an error, but got none');
        })
        .catch(output => {
          expect(output.stderr).toContain('Please provide an output directory');
          done();
        });
    });
  });

  function itProducesTheExpectedOutput() {
    it('writes a css file and all asset files', function() {
      expect(path.join('public', 'components.css')).toBeAFile();

      for (const expectedPackage of expectedPackages) {
        expect(path.join('public', expectedPackage, `${expectedPackage}.png`)).toBeAFile();
      }
    });

    it('inlines the css in the right order', function(done) {
      readCss().then(css => {
        expect(css).toHaveOrder('drums', 'brakes');
        expect(css).toHaveOrder('calipers', 'brakes');
        expect(css).toHaveOrder('mr-fusion', 'delorean');
        expect(css).toHaveOrder('brakes', 'delorean');
        expect(css).toHaveOrder('brakes', 'focus');
        expect(css).toHaveOrder('gate', 'truck-bed');
        expect(css).toHaveOrder('cowboy-hat', 'f150');
        expect(css).toHaveOrder('truck-bed', 'f150');
        expect(css).toHaveOrder('truck-tires', 'f150');
        expect(css).toHaveOrder('88-mph', 'timeTravel');
        expect(css).toHaveOrder('delorean', 'timeTravel');
        done();
      });
    });

    it('has no duplicates', function(done) {
      readCss().then(css => {
        const rules = css.split('\n').filter(Boolean);
        expect(rules.length).toBe(expectedPackages.length);

        for (const expectedPackage of expectedPackages) {
          expect(rules).toContain(jasmine.stringMatching(`\\.${expectedPackage} \\{`));
        }
        done();
      });
    });
  }

  describe('normal use case', function() {
    beforeEach(function(done) {
      cli('public/')
        .then(function({stdout, stderr}) {
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
          done();
        })
        .catch(function(err) {
          throw err;
        });
    });

    itProducesTheExpectedOutput();

    it('puts assets in subdirectories', function(done) {
      readCss().then(css => {
        const rules = css.split('\n').filter(Boolean);

        for (const expectedPackage of expectedPackages) {
          expect(rules).toContain(`.${expectedPackage} {background: url('${expectedPackage}/${expectedPackage}.png')}`);
        }
        done();
      });
    });
  });

  describe('when a whitelist is configured', function() {
    beforeEach(function(done) {
      fs.writeFile(
        path.join(__dirname, dummyProjectName, '.drfrankenstylerc'),
        JSON.stringify({whitelist: ['timeTravel', 'delorean', 'focus']})
      ).then(() => {
          cli('public/')
            .then(function({stdout, stderr}) {
              if (stdout) console.log(stdout);
              if (stderr) console.error(stderr);
              done();
            })
            .catch(function(err) {
              throw err;
            });
        });
    });

    it('omits the packages that are not in the whitelist', function(done) {
      readCss().then(css => {
        expect(css).toHaveOrder('drums', 'brakes');
        expect(css).toHaveOrder('calipers', 'brakes');
        expect(css).toHaveOrder('mr-fusion', 'delorean');
        expect(css).toHaveOrder('brakes', 'delorean');
        expect(css).toHaveOrder('brakes', 'focus');
        expect(css).toHaveOrder('88-mph', 'timeTravel');
        expect(css).toHaveOrder('delorean', 'timeTravel');
        expect(css.includes('f150')).toEqual(false);
        expect(css.includes('gate')).toEqual(false);
        expect(css.includes('truck-bed')).toEqual(false);
        expect(css.includes('cowboy-hat')).toEqual(false);
        done();
      });
    });
  });

  describe('using the low-level api', () => {
    beforeEach(done => {
      var setupStream = setup({cached: false});
      merge(
        setupStream.pipe(copyAssets()),
        setupStream.pipe(generateCss(cssFilesFromDependencies()))
      ).pipe(dest('public/')).on('end', done);
    });

    itProducesTheExpectedOutput();

    describe('using the cache', () => {
      beforeEach(done => {
        var setupStream = setup({cached: true});
        merge(
          setupStream.pipe(copyAssets()),
          setupStream.pipe(generateCss(cssFilesFromDependencies()))
        ).pipe(dest('public/')).on('end', done);
      });

      itProducesTheExpectedOutput();
    });
  });

  describe('with Rails asset-urls', function() {
    beforeEach(function(done) {
      cli('--rails public/').then(done);
    });

    itProducesTheExpectedOutput();

    it('puts assets in subdirectories and uses the asset-url helper', function(done) {
      readCss().then(css => {
        const rules = css.split('\n').filter(Boolean);

        for (const expectedPackage of expectedPackages) {
          expect(rules).toContain(`.${expectedPackage} {background: asset-url('${expectedPackage}/${expectedPackage}.png')}`);
        }
        done();
      });
    });
  });
});
