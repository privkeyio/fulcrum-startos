# Updating the upstream version

The image is built from the `fulcrum` submodule, which tracks `master` of [privkeyio/Fulcrum](https://github.com/privkeyio/Fulcrum). That fork carries BLAKE2b header support on top of [cculianu/Fulcrum](https://github.com/cculianu/Fulcrum), so an upstream release reaches this package once it is merged into the fork.

## Determining the upstream version

Latest upstream release, and the fork's latest release:

```sh
gh release view -R cculianu/Fulcrum --json tagName -q .tagName
gh release view -R privkeyio/Fulcrum --json tagName -q .tagName
```

The version the fork builds is `VERSION` in `fulcrum/src/Common.h`.

## Applying the bump

1. Point the submodule at the fork's merged `master`:

   ```sh
   git -C fulcrum fetch origin master
   git -C fulcrum checkout <commit>
   git add fulcrum
   ```

2. In `startos/versions/current.ts`, set `version` to `#blake:<new version>:0` and update the release notes.

The Makefile passes the submodule's commit to the image build as `FULCRUM_GIT_COMMIT`, so the binary reports it.
