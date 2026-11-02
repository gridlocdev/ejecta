#!/usr/bin/env python3
"""Run a built Ejecta-TV.app in a fresh tvOS Simulator and check its console.

Usage: run_sim.py APP_PATH BUNDLE_ID [TIMEOUT_SECONDS]

Creates an Apple TV simulator on the tvOS runtime matching the SDK, installs and launches
the app with its console attached, and prints everything it logs. Exits 0 once
the app logs a line containing "DONE" with no "FAIL" lines before it, and 1 on
a FAIL, a crash or a timeout. The simulator is deleted afterwards.
"""
import json, os, queue, subprocess, sys, threading, time

def simctl(*args, check=True):
    return subprocess.run(['xcrun', 'simctl', *args], check=check, capture_output=True, text=True)

def main():
    app, bundle_id = sys.argv[1], sys.argv[2]
    timeout = float(sys.argv[3]) if len(sys.argv) > 3 else 180

    runtimes = [r for r in json.loads(simctl('list', 'runtimes', '-j').stdout)['runtimes']
                if r.get('platform') == 'tvOS' and r.get('isAvailable')]
    if not runtimes:
        print('No tvOS simulator runtime is installed (xcodebuild -downloadPlatform tvOS)')
        return 1
    # The runtime that matches the SDK the app was built with, else the newest
    sdk = subprocess.run(['xcrun', '--sdk', 'appletvsimulator', '--show-sdk-version'],
                         capture_output=True, text=True).stdout.strip()
    runtimes.sort(key=lambda r: [int(x) for x in r['version'].split('.')])
    runtime = next((r for r in runtimes if r['version'] == sdk), runtimes[-1])
    device_types = [d for d in runtime.get('supportedDeviceTypes', []) if 'Apple TV' in d['name']]
    device_type = next((d for d in device_types if '4K' in d['name']), device_types[-1] if device_types else None)
    if not device_type:
        print('No Apple TV device type for', runtime['name'])
        return 1
    print('Simulator:', device_type['name'], 'on', runtime['name'], flush=True)

    udid = simctl('create', 'Ejecta device tests', device_type['identifier'], runtime['identifier']).stdout.strip()
    try:
        simctl('boot', udid)
        simctl('bootstatus', udid, '-b')
        simctl('install', udid, app)

        # OS_ACTIVITY_DT_MODE makes NSLog write to the console we read
        env = dict(os.environ, SIMCTL_CHILD_OS_ACTIVITY_DT_MODE='YES')
        process = subprocess.Popen(['xcrun', 'simctl', 'launch', '--console', '--terminate-running-process',
                                    udid, bundle_id], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True, env=env, bufsize=1)
        # A reader thread, as select() on the pipe misses lines already in
        # Python's buffer once the app goes quiet
        lines = queue.Queue()
        def read():
            for line in process.stdout:
                lines.put(line)
            lines.put(None)  # the app exited
        threading.Thread(target=read, daemon=True).start()
        failed, done = [], False
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                line = lines.get(timeout=1)
            except queue.Empty:
                continue
            if line is None:
                break
            print(line.rstrip(), flush=True)
            if 'FAIL ' in line:
                failed.append(line.strip())
            if 'DONE' in line:
                done = True
                break
        if not done:
            print('\nThe tests did not finish: crash or timeout after %d s' % timeout)
            # Simulator apps are processes on the Mac: show where each thread is
            pids = subprocess.run(['pgrep', '-f', 'Ejecta-TV.app/Ejecta-TV'], capture_output=True, text=True).stdout.split()
            if pids:
                sample = subprocess.run(['sample', pids[0], '2'], capture_output=True, text=True).stdout
                print('\nThread stacks (sample):\n' + '\n'.join(sample.splitlines()[:250]))
            else:
                print('The app is not running: it crashed')
                reports = os.path.expanduser('~/Library/Logs/DiagnosticReports')
                crashes = sorted([f for f in os.listdir(reports) if 'Ejecta' in f], reverse=True) if os.path.isdir(reports) else []
                if crashes:
                    print(open(os.path.join(reports, crashes[0]), errors='replace').read()[:8000])
            process.terminate()
            return 1
        process.terminate()
        if failed:
            print('\n%d failed:\n  ' % len(failed) + '\n  '.join(failed))
            return 1
        print('\nAll device tests passed')
        return 0
    finally:
        simctl('shutdown', udid, check=False)
        simctl('delete', udid, check=False)

if __name__ == '__main__':
    sys.exit(main())
