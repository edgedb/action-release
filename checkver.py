#!/usr/bin/env python3


import argparse
import re
import sys

import distlib.version
import whatthepatch


PEP440_SUFFIXES = (
    "[._-]?"
    r"((?!post)(?:beta|b|c|pre|RC|alpha|a|patch|pl|p|dev)(?:(?:[.-]?\d+)*)?)?"
    r"([+-]?([0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*))?"
)


PEP440_VERSION = (
    r"(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?{}(?:\+[^\s]+)?".format(
        PEP440_SUFFIXES
    )
)


SEMVER = (
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)"
    r"(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?"
    r"(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$"
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--version-line-pattern',
        help='Extended regular expression to match the version line '
             'in the diff.  The pattern may contain [[:PEP440:]] '
             'and [[:SEMVER:]] magic "classes" that match Python and '
             'SemVer versions correspondingly',
        default=r'__version__\s*=\s*(?:[\'"])([[:PEP440:]])(?:[\'"])')
    parser.add_argument(
        '--version-file',
        help='Name of the file containing the version string. '
             'If not specified, the first match will be used.')
    parser.add_argument(
        'diff_file',
        help='Path to the diff.  Use \'-\' for standard input.')

    args = parser.parse_args()

    if args.diff_file == '-':
        diff_text = sys.stdin.read()
    else:
        with open(args.diff_file) as f:
            diff_text = f.read()

    regexp = args.version_line_pattern

    regexp = regexp.replace('[[:PEP440:]]', PEP440_VERSION)
    regexp = regexp.replace('[[:SEMVER:]]', SEMVER)

    pattern = re.compile(regexp)

    for diff_file in whatthepatch.parse_patch(diff_text):
        if (not args.version_file
                or diff_file.header.new_path == args.version_file):

            new_version = None
            old_version = None

            for change in diff_file.changes:
                match = pattern.match(change.line)
                if match:
                    if change.old is not None:
                        old_version = match.group(1)
                    elif change.new is not None:
                        new_version = match.group(1)

                if new_version is not None:
                    break

            if new_version is not None:
                break

    if new_version is None:
        print('the diff does not contain a hunk matching '
              'the version expression', file=sys.stderr)
        sys.exit(1)

    if old_version:
        if '[[:PEP440:]]' in args.version_line_pattern:
            old_ver = distlib.version.NormalizedVersion(old_version)
            new_ver = distlib.version.NormalizedVersion(new_version)
        elif '[[:SEMVER:]]' in args.version_line_pattern:
            old_ver = distlib.version.SemanticVersion(old_version)
            new_ver = distlib.version.SemanticVersion(new_version)
        else:
            old_ver = None
            new_ver = None

        if old_ver is not None and new_ver is not None:
            if new_ver < old_ver:
                print('New version is SMALLER than the old!', file=sys.stderr)
                exit(1)
        else:
            print('Custom version pattern, skipping version comparison check.')

    print(new_version)


if __name__ == '__main__':
    main()